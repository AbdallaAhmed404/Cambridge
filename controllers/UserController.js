const customError = require("../customError");
const User = require('../models/UserModel');
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const jwt = require('jsonwebtoken');
const path = require("path");
const Resource = require('../models/ResourceModel');
const ActivationCode = require('../models/ActivationCode');
const UserActivation = require('../models/UserActivation');
const SibApiV3Sdk = require('@sendinblue/client');
const axios = require('axios');


const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
const apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_API_KEY;



const checkActivationCode = async (req, res) => {
  try {
    const { code } = req.body;
    // ملاحظة: نفترض أنك ترسل user_id في الطلب أيضاً للتحقق من محاولات التفعيل المكررة
    // ولكن للآن، سنركز على التحقق العام للكود فقط كما طلب
    // const { code, user_id } = req.body; 

    if (!code) {
      return res.status(400).json({ message: "Access code is required." });
    }

    // 1. تنظيف الكود وتحويله إلى حروف كبيرة للبحث
    const cleanedCode = code.toUpperCase().trim();
    const codeLength = cleanedCode.length;

    // 2. التحقق من طول الكود
    if (codeLength !== 14 && codeLength !== 19) {
      return res.status(400).json({
        message: "Invalid code length. Code must be 12 or 16 characters."
      });
    }

    // 3. البحث عن الكود في قاعدة البيانات (مع جلب بيانات المورد المرتبطة)
    const foundCode = await ActivationCode.findOne({ code_value: cleanedCode }).populate('product_id');

    if (!foundCode) {
      return res.status(404).json({ message: "Invalid access code. Please check your entry." });
    }

    // 4. التحقق من حالة الصلاحية وتاريخ الانتهاء
    if (!foundCode.is_active) {
      return res.status(400).json({ message: "This access code is currently inactive." });
    }
    if (foundCode.expiry_date && new Date() > foundCode.expiry_date) {
      return res.status(400).json({ message: "This access code has expired." });
    }

    // 5. **التحقق من حد التفعيلات (باستخدام UserActivation)** 🔑
    const currentActivationsCount = await UserActivation.countDocuments({ code_id: foundCode._id });

    const remainingActivations = foundCode.max_activations - currentActivationsCount;

    if (remainingActivations <= 0) {
      return res.status(400).json({
        message: "This access code has reached its maximum number of activations and cannot be used again."
      });
    }

    // 6. إرجاع بيانات النجاح
    return res.status(200).json({
      message: `Access code is valid. ${remainingActivations} activation(s) remaining.`,
    });

  } catch (error) {
    console.error("Error during code check:", error);
    return res.status(500).json({ message: "Server error during code check." });
  }
};

const sendActivationEmail = async (user) => {
  // 1. إنشاء توكن التفعيل (الكود كما هو)
  const activationToken = jwt.sign(
    { id: user._id },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  // 2. حفظ التوكن في قاعدة البيانات (الكود كما هو)
  user.activationToken = activationToken;
  user.activationExpires = Date.now() + (24 * 60 * 60 * 1000);
  await user.save({ validateBeforeSave: false });

  // 3. بناء الرابط - **مهم: استخدام BASE_URL من متغيرات البيئة**
  const BASE_URL = 'https://cambridgeksa.org';
  const activationURL = `${BASE_URL}/activate-account/${activationToken}`;

  // 4. إعداد بيانات رسالة Brevo API
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

  sendSmtpEmail.sender = {
    name: "Cambridge Support",
    email: "support@cambridgeksa.org" // الإيميل الذي قمت بمصادقة نطاقه
  };
  sendSmtpEmail.to = [{ email: user.email }];
  sendSmtpEmail.subject = ' Activate Your Account';

  // استخدام كود HTML الموجود لديك
  sendSmtpEmail.htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #0056d2; border-radius: 8px;">
            <h2 style="color: #0056d2;">Account Activation</h2>
            <p>Dear ${user.FirstName || 'User'},</p>
            <p>Thank you for registering. Please click the button below to **activate your account** and start using our services. The link is valid for **24 hours**.</p>
            <div style="text-align: center; margin: 25px 0;">
                <a href="${activationURL}"
                    style="display: inline-block; padding: 12px 25px; font-size: 17px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px; font-weight: bold;"
                >Activate My Account</a>
            </div>
            <p>If you did not register, please ignore this message.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #777;">Cambridge Support Team</p>
        </div>
    `;

  // 5. إرسال الإيميل عبر API
  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    console.log('API email sent successfully using Brevo.');
  } catch (error) {
    // يمكنك وضع معالجة أخطاء أفضل هنا
    console.error('Error sending Brevo API email:', error.response ? error.response.text : error);
    throw new Error('Failed to send activation email via Brevo API.');
  }
};


const activateAccount = async (req, res) => {
  const { token } = req.params;

  try {
    // تحقق من التوكن
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id;

    // البحث عن المستخدم وتأكيد أنه لم يتم تفعيله
    const user = await User.findOne({
      _id: userId,
      isActive: false,
      activationExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).send("The activation link is invalid or has expired. Please request a resend.");
    }

    // تفعيل الحساب
    user.isActive = true;
    user.activationToken = undefined;
    user.activationExpires = undefined;
    await user.save();

    res.redirect('https://cambridgeksa.org/accounts/login/?activated=true');

  } catch (error) {
    console.error('Activation error:', error);
    return res.status(400).send("The activation link is invalid or has expired. Please request a resend.");
  }
};


const register = async (req, res) => {
  try {
    const {
      Role,
      FirstName,
      LastName,
      email,
      confirmEmail,
      password,
      confirmPassword,
      SchoolName,
      SchoolLocation
    } = req.body;
    console.log()
    // 👈 1. إضافة التحقق من الحقول الجديدة (SchoolName و SchoolLocation)
    if (!Role || !FirstName || !LastName || !email || !confirmEmail || !password || !confirmPassword || !SchoolName || !SchoolLocation) {
      return res.status(400).json({ message: "Please fill all required fields." });
    }

    // التأكد من أن حقل SchoolLocation ليس "----------" في حال لم يختر المستخدم دولة
    if (SchoolLocation === "----------") {
      return res.status(400).json({ message: "Please select a School Location." });
    }

    if (email !== confirmEmail) {
      return res.status(400).json({ message: "Emails do not match." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered." });
    }

    const newUser = new User({
      Role,
      FirstName,
      LastName,
      email: email.toLowerCase(),
      password,
      SchoolName,
      SchoolLocation,
      isActive: false
    });
    await newUser.save();
    await sendActivationEmail(newUser);

    return res.status(201).json({
      message: "The account has been successfully registered. Please activate your account through the link sent to your email.",
      user: newUser,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error" });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // ========== VALIDATION ==========
    if (!email || !password) {
      return res.status(400).json({ message: "Please enter email and password." });
    }

    // ========== FIND USER ==========
    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    // ========== CHECK PASSWORD ==========
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Invalid email or password." });
    }

    if (!user.isActive) {
      return res.status(403).json({
        message: "The account is not activated. Please check your email or use the resend activation link."
      });
    }
    // ========== GENERATE TOKEN ==========
    const token = await user.generatetoken();

    return res.status(200).json({
      message: "Login successful.",
      token,
      userID: user._id,
    });

  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "Server error. Try again later." });
  }
};



/**
 * 🔑 وظيفة Forgot Password Controller
 * المسار: POST /api/user/forgot-password
 */
const forgotPassword = async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: "Please enter the email address." });
  }


  try {
    // 1. 🔍 التحقق من وجود المستخدم
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found with this email address." });
    }

    // 2. 🔑 إنشاء رمز مميز (Token) لإعادة التعيين (صالح لمدة 10 دقائق)
    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '10m' });

    // 3. 💾 حفظ الرمز المميز في قاعدة البيانات
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 600000; // 10 دقائق
    await user.save();

    // 4. 🔗 بناء رابط إعادة التعيين
    const resetURL = `https://cambridgeksa.org/reset-password/${resetToken}`;

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = {
      name: "Cambridge Support",
      email: "support@cambridgeksa.org"
    };

    // 5. 📧 إعداد محتوى الإيميل (بصيغة مناسبة لإعادة تعيين كلمة المرور)
    sendSmtpEmail.to = [{ email: user.email }];
    sendSmtpEmail.subject = 'Reset Password Request';
    sendSmtpEmail.htmlContent = `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #0056d2; border-radius: 8px;">
            <h2 style="color: #0056d2;">Password Reset</h2>
            <p>Dear ${user.FirstName || 'User'},</p>
            <p>We received a request to reset the password for your account registered with this email: <strong>${user.email}</strong>.</p>
            <p>To reset your password, please click the button below. This link is only valid for **10 minutes**.</p>
            <div style="text-align: center; margin: 25px 0;">
                <a href="${resetURL}" 
                    style="display: inline-block; padding: 12px 25px; font-size: 17px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px; font-weight: bold;"
                >Click to Reset Password</a>
            </div>
            <p>If you did not request a password reset, please ignore this message.</p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 12px; color: #777;">Cambridge Support Team</p>
        </div>
    `;

    // 6. 🚀 إرسال الإيميل عبر API
    await apiInstance.sendTransacEmail(sendSmtpEmail);

    // 7. ✅ إرسال رد النجاح
    res.status(200).json({
      message: "The password reset link has been sent to your email. Please check your inbox.",
    });

  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({
      message: "The sending operation failed. Please check the email settings and try again."
    });
  }
};


const resetPassword = async (req, res) => {
  // 1. استخلاص التوكن وكلمة المرور الجديدة
  const { token } = req.params; // التوكن الموجود في مسار URL
  const { newPassword } = req.body; // كلمة المرور الجديدة من الـ Frontend

  // 2. التحقق المبدئي من كلمة المرور
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({
      message: "The password must be at least 6 characters long."
    });
  }

  try {
    // 3. التحقق من التوكن في قاعدة البيانات (الأمان أولاً)
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() } // $gt تعني "أكبر من" (لم تنته صلاحيته)
    });

    if (!user) {
      // يتم إرسال هذا الخطأ إذا: انتهت صلاحية التوكن، أو التوكن غير صحيح
      return res.status(400).json({
        message: "The password reset link is invalid or has expired. Please request a new link."
      });
    }

    // 4. فك تشفير التوكن (للتحقق الإضافي - اختياري)
    // يمكنك تخطي هذه الخطوة والاكتفاء بخطوة البحث في DB
    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(401).json({
          message: "The password reset link is invalid or has expired."
        });
      }
      // يمكن هنا التحقق من أن الـ decoded.id يطابق user._id
    });

    // 5. تشفير وحفظ كلمة المرور الجديدة
    user.password = newPassword

    // 6. مسح حقول التوكن وانتهاء الصلاحية من قاعدة البيانات
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // 7. إرسال رد النجاح
    res.status(200).json({
      message: "Password successfully updated. You can now log in using your new password."
    });

  } catch (error) {
    console.error("Error resetting password:", error);
    res.status(500).json({
      message: "An unexpected error occurred while updating the password."
    });
  }
};

const resendActivation = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });

    if (!user) {
      // رسالة عامة للأمان
      return res.status(200).json({ message: "If the email is registered and not activated, a new activation link will be sent." });
    }

    if (user.isActive) {
      return res.status(400).json({ message: "The account is already activated. You can log in directly." });
    }

    // إعادة إرسال التفعيل
    await sendActivationEmail(user);

    res.status(200).json({
      message: "A new activation link has been successfully sent to your email."
    });

  } catch (error) {
    console.error('Resend activation error:', error);
    res.status(500).json({ message: "Failed to send the email." });
  }
};

const contactForm = async (req, res) => {
  try {
    const { name, email, accountEmail, helpTopic, subject, description } = req.body;

    const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();

    sendSmtpEmail.sender = {
      name: "Cambridge Support",
      email: "support@cambridgeksa.org" // نستخدم الايميل الموثق كمرسل أساسي
    };

    sendSmtpEmail.to = [{ email: "support@cambridgeksa.org" }]; // الإرسال إلى إيميل الدعم الخاص بك
    sendSmtpEmail.replyTo = { email: email, name: name }; // الرد يكون على إيميل المستخدم
    sendSmtpEmail.subject = `Contact Form — ${subject}`;

    sendSmtpEmail.htmlContent = `
        <h2>New Support Message</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>User Email:</strong> ${email}</p>
        <p><strong>Account Email:</strong> ${accountEmail}</p>
        <p><strong>Help Topic:</strong> ${helpTopic || "None"}</p>
        <p><strong>Description:</strong><br>${description}</p>
    `;

    await apiInstance.sendTransacEmail(sendSmtpEmail);

    return res.status(200).json({ message: "Message sent successfully!" });

  } catch (err) {
    console.error("Email send error:", err);
    res.status(500).json({ message: "Server error. Please try again later." });
  }
};

const addResource = async (req, res) => {
  try {
    const { title, author, edition } = req.body;
    const files = req.files;

    if (!title || !files || !files.coverPhoto || files.coverPhoto.length === 0) {
      return res.status(400).json({ message: "Title and Cover photo are required." });
    }

    // حول الـ backslashes إلى slashes قبل التخزين
    const coverPhotoPath = files.coverPhoto[0].path.replace(/\\/g, '/');
    const bookPath = files.bookFile ? files.bookFile[0].path.replace(/\\/g, '/') : undefined;
    const audioPath = files.audioFile ? files.audioFile[0].path.replace(/\\/g, '/') : undefined;
    const videoPath = files.videoFile ? files.videoFile[0].path.replace(/\\/g, '/') : undefined;

    const newResource = new Resource({
      title,
      author,
      edition,
      photo: coverPhotoPath,
      bookPath,
      audioPath,
      videoPath,
    });

    await newResource.save();

    return res.status(201).json({
      message: "Resource added successfully.",
      resource: newResource
    });

  } catch (error) {
    console.error("Add Resource Error:", error);
    return res.status(500).json({ message: "Server error during resource addition." });
  }
};

// ----------------------------------------------------
// 🆕 وظيفة: جلب جميع الموارد (لتغذية شاشة AllProducts)
// ----------------------------------------------------
const getAllResources = async (req, res) => {
  try {
    const resources = await Resource.find().sort({ createdAt: -1 });
    return res.status(200).json(resources);
  } catch (error) {
    console.error("Get All Resources Error:", error);
    return res.status(500).json({ message: "Server error." });
  }
};

const getResourceById = async (req, res) => {
  try {
    const { id } = req.params; // جلب الـ ID من URL Parameters

    // البحث عن المورد
    const resource = await Resource.findById(id);

    if (!resource) {
      return res.status(404).json({ message: "Resource not found." });
    }

    return res.status(200).json(resource);
  } catch (error) {
    console.error("Get Resource By ID Error:", error);
    // إذا كان الـ ID غير صالح (مثل طول خاطئ)، سيتم الإمساك بالخطأ هنا
    return res.status(500).json({ message: "Server error or invalid resource ID." });
  }
};


// ----------------------------------------------------
// 🆕 وظيفة: تفعيل مورد باستخدام كود التفعيل
// ----------------------------------------------------
const activateResourceByCode = async (req, res) => {
  try {
    const { code } = req.body;

    const userId = req.user.id;

    const userRole = req.user.role;
    if (!code) {
      return res.status(400).json({ message: "Activation code is required." });
    }

    // 1. البحث عن الكود
    const activationCode = await ActivationCode.findOne({ code_value: code.toUpperCase() });


    if (!activationCode || !activationCode.is_active || (activationCode.expiry_date && activationCode.expiry_date < new Date())) {
      return res.status(404).json({ message: "Invalid, inactive, or expired activation code." });
    }

    const resource = await Resource.findById(activationCode.product_id);

    if (!resource) {
      // حالة نادرة: الكود صالح لكن المنتج المرتبط به غير موجود
      return res.status(404).json({ message: "Resource linked to this code was not found." });
    }

    if (userRole === 'Student' && resource.targetRole === 'Teacher') {
      return res.status(403).json({ message: "Access Denied. Students cannot activate Teacher resources." });
    }

    // 2. التحقق من عدد التفعيلات
    const existingActivations = await UserActivation.countDocuments({ code_id: activationCode._id });
    if (existingActivations >= activationCode.max_activations) {
      // يمكن هنا تحديث is_active إلى false إذا كان هذا هو آخر تفعيل
      // await ActivationCode.findByIdAndUpdate(activationCode._id, { is_active: false });
      return res.status(400).json({ message: "Activation limit reached for this code." });
    }

    // 3. التحقق مما إذا كان المستخدم قد فعّل المورد بالفعل باستخدام هذا الكود
    const alreadyActivated = await UserActivation.findOne({
      code_id: activationCode._id,
      user_id: userId
    });

    if (alreadyActivated) {
      return res.status(400).json({ message: "This resource is already active for your account." });
    }

    // 4. إنشاء سجل تفعيل جديد
    const newUserActivation = new UserActivation({
      code_id: activationCode._id,
      user_id: userId,
    });
    await newUserActivation.save();



    // 6. نجاح التفعيل
    return res.status(200).json({
      message: "Resource activated successfully!",
      resource: resource // إرسال المورد الذي تم تفعيله
    });

  } catch (error) {
    console.error("Activate Resource By Code Error:", error);
    // التعامل مع خطأ التكرار (Unique index error) إذا حاول المستخدم تفعيل نفس الكود مرتين بالتزامن
    if (error.code === 11000) {
      return res.status(400).json({ message: "This resource is already active for your account (Duplicate key error)." });
    }
    return res.status(500).json({ message: "Server error during resource activation." });
  }
};

const getActivatedResources = async (req, res) => {
  try {
    // افتراض أن req.user.id يتم توفيره بواسطة Middleware المصادقة
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required." });
    }

    const DEFAULT_EXPIRY_DAYS = 302;

    // 1. إيجاد سجلات التفعيل مع جلب product_id و expiry_date من ActivationCode
    const userActivations = await UserActivation.find({ user_id: userId })
      .select('code_id activation_date')
      .populate({
        path: 'code_id',
        // جلب product_id و expiry_date من ActivationCode
        select: 'product_id expiry_date',
      });

    const validResourcesData = [];
    const productActivationMap = new Map();

    // 2. تصفية السجلات وإعداد البيانات
    userActivations.forEach(activation => {
      const code = activation.code_id;

      if (!code || !code.product_id) return;

      const productId = code.product_id.toString();
      const activationDate = new Date(activation.activation_date);
      const expiryDate = code.expiry_date ? new Date(code.expiry_date) : null;

      // حساب تاريخ الانتهاء النهائي
      let finalExpiryDate = expiryDate;
      if (!finalExpiryDate) {
        // تطبيق قاعدة الـ 302 يوم على تاريخ التفعيل إذا لم يوجد expiry_date
        finalExpiryDate = new Date(activationDate);
        finalExpiryDate.setDate(activationDate.getDate() + DEFAULT_EXPIRY_DAYS);
      }

      // إخفاء المورد إذا كان منتهي الصلاحية
      if (finalExpiryDate > new Date()) {
        // إذا لم نقم بحفظ هذا المورد بعد، قم بإضافته
        if (!productActivationMap.has(productId)) {
          validResourcesData.push({
            productId,
            activationDate: activation.activation_date,
            expiryDate: code.expiry_date, // التاريخ الصريح أو null
          });
          productActivationMap.set(productId, true);
        }
      }
    });

    const productIds = validResourcesData.map(d => d.productId);

    if (productIds.length === 0) {
      return res.status(200).json([]);
    }

    // 3. جلب تفاصيل الموارد
    const resources = await Resource.find({
      _id: { $in: productIds }
    }).select('title photo targetRole') // 👈 تأكد من وجود targetRole هنا
      .sort({ createdAt: -1 });

    // 4. دمج التواريخ مع بيانات الموارد قبل الإرسال
    const resourcesWithDates = resources.map(resource => {
      const relevantData = validResourcesData.find(d => d.productId === resource._id.toString());

      return {
        ...resource.toObject(),
        activation_date: relevantData.activationDate,
        expiry_date: relevantData.expiryDate,
      };
    });

    return res.status(200).json(resourcesWithDates);

  } catch (error) {
    console.error("Get Activated Resources Error:", error);
    return res.status(500).json({ message: "Server error during fetching activated resources." });
  }
};


// ... (Imports: path, Resource, etc. assumed)
downloadResourceFile = async (req, res) => {
    try {
        const { type, resourceId, audioId } = req.params;
        const resource = await Resource.findById(resourceId);

        if (!resource) {
            return res.status(404).json({ message: "Resource not found" });
        }

        let filePath = null;
        let suggestedFileName = "resource_file"; // اسم افتراضي للملف

        // --- تحديد المسار واسم الملف المقترح ---
        if (type === "book") {
            filePath = resource.bookPath;
            suggestedFileName = `${resource.title}-Book.pdf`;
        } else if (type === "audio") {
            const audioObj = resource.pageAudios.find(a => a._id.toString() === audioId);
            if (audioObj) {
                filePath = audioObj.path;
                suggestedFileName = `${resource.title}-Page-${audioObj.pageNumber}.mp3`;
            }
        } else if (type === "video") {
            const videoObj = resource.pageVideos.find(v => v._id.toString() === audioId);
            if (videoObj) {
                filePath = videoObj.path;
                suggestedFileName = `${resource.title}-Page-${videoObj.pageNumber}.mp4`;
            }
        }

        if (!filePath) {
            return res.status(404).json({ message: "File not found" });
        }

        // ⭐ التغيير الرئيسي: استخدام axios لجلب الملف وإرساله

        // 1. جلب بيانات الملف من رابط Cloudflare R2
        const response = await axios({
            method: 'get',
            url: filePath, // رابط Cloudflare R2
            responseType: 'stream' // لتجنب استهلاك الذاكرة العالية
        });

        // 2. تعيين الـ Headers التي تجبر المتصفح على التحميل
        res.setHeader('Content-Type', response.headers['content-type']);
        res.setHeader('Content-Disposition', `attachment; filename="${suggestedFileName}"`);
        
        // 3. توجيه محتوى الملف مباشرة إلى الـ Response
        response.data.pipe(res);
        
    }
    catch (err) {
        console.error("Download error:", err);
        // في حالة وجود خطأ في جلب الملف من R2 (مثل 404 أو timeout)
        if (err.response && err.response.status) {
             return res.status(err.response.status).json({ message: "Error fetching file from Cloud Storage." });
        }
        res.status(500).json({ message: "Download error" });
    }
};
// ...



module.exports = {
  // ... تصدير الدوال القديمة
  register,
  login,
  contactForm,
  addResource,      // 🆕
  getAllResources,
  getResourceById,
  activateResourceByCode,
  getActivatedResources,
  forgotPassword,
  resetPassword,
  activateAccount,
  resendActivation,
  checkActivationCode,
  downloadResourceFile

};