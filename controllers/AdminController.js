const mongoose = require('mongoose')
const UserModel = require('../models/UserModel')
const AdminModel = require('../models/AdminModel');
const bcrypt = require('bcryptjs');
const customError = require('../customError');
const jwt = require('jsonwebtoken');
const Resource = require('../models/ResourceModel');
const fs = require('fs');
const path = require('path');
const ActivationCode = require('../models/ActivationCode.js');
const UserActivation = require('../models/UserActivation.js');
const { uploadFileToR2,deleteFileFromR2 } = require('../middlewares/r2Upload.js');



const adminLogin = async (req, res, next) => {
    const { email, password } = req.body;

    try {
        const admin = await AdminModel.findOne({ email });

        if (!admin) {
            return res.status(401).json({ message: 'Invalid admin credentials' });
        }

        if (password !== admin.password) {
            return res.status(401).json({ message: 'Invalid admin credentials' });
        }

        const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET);
        res.status(200).json({ message: 'Admin logged in successfully', token });
    } catch (err) {
        return next(customError({
            statusCode: 500,
            message: "Failed to login admin"
        }));
    }
};

const updateAdminPassword = async (req, res, next) => {
    try {
        const adminId = process.env.ROOT_ADMIN_ID;
        const { oldPassword, newPassword, confirmPassword } = req.body;

        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }

        const admin = await AdminModel.findById(adminId);
        if (!admin) {
            return res.status(404).json({ message: "Admin not found" });
        }

        if (oldPassword !== admin.password) {
            return res.status(401).json({ message: "Old password is incorrect" });
        }


        admin.password = newPassword;
        await admin.save();

        res.status(200).json({ message: "Password updated successfully" });

    } catch (err) {
        console.error("Error updating admin password:", err);
        return next(customError({
            statusCode: 500,
            message: "Failed to update admin password"
        }));
    }
};

const AllUsers = async (req, res, next) => {
    try {
        // Find all users (the toJSON transform in the model will remove password and resetCode)
        const users = await UserModel.find({});
        // نستخدم toJSON transform لـ Mongoose لإزالة كلمة المرور و resetCode
        res.status(200).json(users);
    } catch (err) {
        console.error("Error fetching users:", err);
        return next(customError({
            statusCode: 500,
            message: "Failed to retrieve users"
        }))
    }
}

// 🎯 DelUser المُعدلة لحذف المستخدم باستخدام ID من req.params
const DelUser = async (req, res, next) => {
    try {
        const userId = req.params.id; // 💡 تم التعديل لاستخدام ID من parameters

        const deletedUser = await UserModel.findByIdAndDelete(userId);

        if (!deletedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        const deletionResult = await UserActivation.deleteMany({

            user_id: userId // أو الاسم الذي تستخدمه في موديل UserActivation
        });

        res.status(200).json({ message: "User deleted successfully" });
    } catch (err) {
        console.error("Error deleting user:", err);
        return next(customError({
            statusCode: 500,
            message: "Failed to delete user"
        }))
    }
}


const addResource = async (req, res) => {
    try {
        const { title, targetRole, audioPageNumbers = [], videoPageNumbers = [] } = req.body;
        const files = req.files;

        if (!title || !targetRole || !files || !files.coverPhoto || !files.bookFile) {
            // ... (باقي التحقق من البيانات الأساسية كما هو)
        }

        const audioFiles = files.pageAudioFiles || [];
        const videoFiles = files.pageVideoFiles || [];

        // 2 & 3. التحقق من تطابق الأعداد كما هو...

        // 🚨 التغيير الكبير: الرفع إلى R2 والحصول على الـ URL بدلاً من الـ Path
        
        // 1. رفع صورة الغلاف
        const coverPhotoFile = files.coverPhoto[0];
        const coverPhotoURL = await uploadFileToR2(coverPhotoFile, 'covers/');

        // 2. رفع ملف الكتاب (PDF)
        const bookFile = files.bookFile[0];
        const bookURL = await uploadFileToR2(bookFile, 'books/');
        
        // 3. رفع ملفات الصوت
        const pageAudiosArray = await Promise.all(
            audioFiles.map(async (file, index) => {
                const audioURL = await uploadFileToR2(file, 'audio/');
                return {
                    pageNumber: parseInt(audioPageNumbers[index]),
                    path: audioURL, // 🚨 حفظ الـ URL في الداتابيز
                };
            })
        );
        
        // 4. رفع ملفات الفيديو
        const pageVideosArray = await Promise.all(
            videoFiles.map(async (file, index) => {
                const videoURL = await uploadFileToR2(file, 'video/');
                return {
                    pageNumber: parseInt(videoPageNumbers[index]),
                    path: videoURL, // 🚨 حفظ الـ URL في الداتابيز
                };
            })
        );

        // 5. إنشاء المورد وحفظه (باستخدام الـ URLs الجديدة)
        const newResource = new Resource({
            title,
            targetRole,
            photo: coverPhotoURL, // 🚨 تم تغيير المسار إلى URL
            bookPath: bookURL,   // 🚨 تم تغيير المسار إلى URL
            pageAudios: pageAudiosArray,
            pageVideos: pageVideosArray,
        });

        await newResource.save();
        
        return res.status(201).json({ 
            message: "Resource added successfully and files uploaded to R2.", 
            resource: newResource 
        });

    } catch (error) {
        console.error("❌ Add Resource Error during R2 upload:", error);
        return res.status(500).json({ message: "Server error during resource addition. Could not upload files." });
    }
};

const getAllResources = async (req, res) => {
    try {
        // البحث عن جميع الموارد
        const resources = await Resource.find({})
            // تحديد الحقول المراد إظهارها في القائمة الرئيسية
            .select('title targetRole photo pageAudios pageVideos createdAt');

        return res.status(200).json({
            message: "Resources retrieved successfully.",
            resources: resources
        });

    } catch (error) {
        console.error("Get All Resources Error:", error);
        return res.status(500).json({ message: "Server error during resource retrieval." });
    }
};

const getResourceById = async (req, res) => {
    try {
        // نستخدم req.params.id لجلب الـ ID من الرابط
        const resourceId = req.params.id;

        // جلب المورد بكل تفاصيله
        const resource = await Resource.findById(resourceId);

        if (!resource) {
            return res.status(404).json({ message: "Resource not found." });
        }

        return res.status(200).json(resource);

    } catch (error) {
        console.error("Get Resource by ID Error:", error);
        return res.status(500).json({ message: "Server error during resource retrieval." });
    }
};

// =======================================================
// 2. حذف مورد (Delete Resource)
// =======================================================
const deleteResource = async (req, res) => {
    try {
        const resourceId = req.body.id;

        // 1. استرجاع بيانات المورد (كما هو)
        const resource = await Resource.findById(resourceId);
        const activationid = await ActivationCode.find({ product_id: resourceId });

        if (!resource) {
            return res.status(404).json({ message: "Resource not found." });
        }

        // 2. تجميع جميع الـ URLs للحذف
        const filesToDelete = [
            resource.photo,
            resource.bookPath,
            ...resource.pageAudios.map(a => a.path),
            ...resource.pageVideos.map(v => v.path)
        ];

        // 🚨 التغيير الرئيسي: استخدام Promise.all لحذف الملفات من R2 
        await Promise.all(
            filesToDelete.filter(url => url).map(url => deleteFileFromR2(url))
        );
        
        // 3. حذف الـ Activation Code
        // بما أنك تستخدم find و findOneAndDelete، تأكد من حلقة على الـ activationid
        if (activationid && activationid.length > 0) {
            // حذف كل كود تنشيط مرتبط
            await Promise.all(
                activationid.map(code => ActivationCode.findByIdAndDelete(code._id))
            );
            // حذف جميع سجلات تفعيل المستخدم المرتبطة بالمنتج (قد تحتاج لتعديل UserActivation)
            await UserActivation.deleteMany({ activationCode: { $in: activationid.map(a => a._id) } });
        }

        // 4. حذف المورد من الداتابيز
        await Resource.findByIdAndDelete(resourceId);

        res.status(200).json({ message: "Resource and associated files deleted successfully from R2 and MongoDB." });

    } catch (err) {
        console.error("❌ Error deleting resource:", err);
        return res.status(500).json({ message: "Failed to delete resource and its files." });
    }
};

// =======================================================
// 3. تعديل مورد (Update Resource)
// =======================================================
// ملاحظة: دالة التعديل هنا تتعامل مع البيانات النصية (title, author) ومسارات الوسائط فقط.
// إضافة/حذف ملفات الوسائط الجديدة ستكون عملية منفصلة في الواجهة الأمامية.
const updateResource = async (req, res) => {
    // قائمة لتتبع الـ URLs الجديدة التي تم رفعها بنجاح للتمكن من حذفها في حالة فشل عملية الحفظ (Rollback)
    const newlyUploadedUrls = []; 

    try {
        const resourceId = req.body.id;
        const resource = await Resource.findById(resourceId); // افترض أن Resource هو نموذج Mongoose

        if (!resource) {
            return res.status(404).json({ message: 'Resource not found' });
        }

        const files = req.files || {};
        const oldFilesToDelete = []; 

        // 1.1. حذف الغلاف القديم واستبداله بجديد (إذا تم رفع ملف جديد)
        if (files.newPhoto && files.newPhoto[0]) {
            const oldPhotoUrl = resource.photo;
            
            // افترض وجود دالة uploadFileToR2 و deleteFileFromR2
            const newPhotoURL = await uploadFileToR2(files.newPhoto[0], 'covers/');
            
            newlyUploadedUrls.push(newPhotoURL); 

            resource.photo = newPhotoURL;
            if (oldPhotoUrl) {
                oldFilesToDelete.push(oldPhotoUrl);
            }
        }

        // 1.2. حذف ملف الكتاب القديم واستبداله بجديد (إذا تم رفع ملف جديد)
        if (files.newBook && files.newBook[0]) {
            const oldBookUrl = resource.bookPath;

            const newBookURL = await uploadFileToR2(files.newBook[0], 'books/');
            
            newlyUploadedUrls.push(newBookURL); 

            resource.bookPath = newBookURL;
            if (oldBookUrl) {
                oldFilesToDelete.push(oldBookUrl);
            }
        }
        
        // 2. تحديث الحقول النصية (تحقق من وجود القيمة قبل التحديث)
        if (req.body.title) resource.title = req.body.title;
        if (req.body.targetRole) resource.targetRole = req.body.targetRole;
        
        // =======================================================
        // 3. التعامل مع وسائط الصفحات (Audios/Videos)
        // =======================================================

        // المسارات القديمة المتبقية المرسلة من الفرونت إند (مصفوفات JSON)
        // **✅ تحسين: استخدام || '[]' لتجنب JSON.parse(undefined) في حال عدم إرسال الحقل**
        const keptPageAudios = JSON.parse(req.body.keptPageAudios || '[]'); 
        const keptPageVideos = JSON.parse(req.body.keptPageVideos || '[]'); 
        
        // المسارات القديمة المخزنة حالياً في الداتابيز
        // **✅ تحسين: استخدام (|| []) لضمان أنها مصفوفة قبل map**
        const oldAudioPaths = (resource.pageAudios || []).map(a => a.path);
        const oldVideoPaths = (resource.pageVideos || []).map(v => v.path);

        // 3.1. تحديد المسارات القديمة التي تم إزالتها للحذف من R2
        const pathsToKeep = [...keptPageAudios.map(a => a.path), ...keptPageVideos.map(v => v.path)];

        const deletedAudioPaths = oldAudioPaths.filter(path => !pathsToKeep.includes(path));
        const deletedVideoPaths = oldVideoPaths.filter(path => !pathsToKeep.includes(path));
        
        oldFilesToDelete.push(...deletedAudioPaths, ...deletedVideoPaths);

        // 3.2. رفع الملفات الجديدة وإضافتها إلى القائمة
        // **✅ تحسين: استخدام || [] لضمان أن uploadedAudios/Videos مصفوفات فارغة إذا لم يتم رفع ملفات**
        const uploadedAudios = files.newAudios || []; 
        const uploadedVideos = files.newVideos || [];
        
        // استلام أرقام الصفحات الجديدة
        const newAudioPageNumbers = JSON.parse(req.body.newAudioPageNumbers || '[]');
        const newVideoPageNumbers = JSON.parse(req.body.newVideoPageNumbers || '[]');

        // 🚀 رفع الملفات الصوتية الجديدة
        const newAudiosWithPages = await Promise.all(
            uploadedAudios.map(async (file, index) => {
                const audioURL = await uploadFileToR2(file, 'audio/');
                newlyUploadedUrls.push(audioURL); 
                return {
                    pageNumber: parseInt(newAudioPageNumbers[index]) || 0,
                    path: audioURL 
                };
            })
        );
        
        // 🚀 رفع ملفات الفيديو الجديدة
        const newVideosWithPages = await Promise.all(
            uploadedVideos.map(async (file, index) => {
                const videoURL = await uploadFileToR2(file, 'video/');
                newlyUploadedUrls.push(videoURL); 
                return {
                    pageNumber: parseInt(newVideoPageNumbers[index]) || 0,
                    path: videoURL 
                };
            })
        );

        // 3.3. دمج كل المسارات
        resource.pageAudios = [...keptPageAudios, ...newAudiosWithPages];
        resource.pageVideos = [...keptPageVideos, ...newVideosWithPages];

        // 4. حفظ المورد
        await resource.save();
        
        // 5. تنفيذ حذف جميع الملفات القديمة من R2 بعد نجاح عملية الحفظ
        await Promise.all(
            oldFilesToDelete.filter(url => url).map(url => deleteFileFromR2(url))
        );

        res.status(200).json({ message: "Resource updated successfully on R2 and MongoDB.", resource });

    } catch (err) {
        console.error("❌ Error updating resource:", err);
        
        // 🚨 Rollback: حذف أي ملفات تم رفعها بنجاح
        if (newlyUploadedUrls.length > 0) {
            console.log(`Starting R2 Rollback: Deleting ${newlyUploadedUrls.length} newly uploaded files.`);
            // افترض وجود دالة deleteFileFromR2
            await Promise.all(
                newlyUploadedUrls.map(url => deleteFileFromR2(url))
            );
        }
        
        return res.status(500).json({ message: "Failed to update resource. Rollback executed for new files." });
    }
};



// 1. POST /admin/activation-codes - إضافة كود جديد
// ... (افترض أن لديك استيرادات Resource و ActivationCode)

const createNewCode = async (req, res) => {
    // 🚨 code_value سيصل بالواصلات
    const { code_value, product_id, max_activations, expiry_date } = req.body;

    // ⛔ التحقق من صحة الإدخال الإجباري
    if (!product_id || !max_activations || !code_value) {
        return res.status(400).json({ message: 'Product ID, maximum activations, and Code Value are required.' });
    }

    // 🚨 التحقق من الطول (14 أو 19) والبنية الصحيحة للواصلات والأحرف الكبيرة
    const length = code_value.length;
    const isValidLength = (length === 14 || length === 19);
    
    // Regex للتحقق من التنسيق: XXXX-XXXX-XXXX أو XXXX-XXXX-XXXX-XXXX
    const codePattern = /^[A-Z0-9]{4}(-[A-Z0-9]{4}){2,3}$/; 
    
    if (!isValidLength || !codePattern.test(code_value)) {
        return res.status(400).json({ 
            message: 'Activation Code must be in the format XXXX-XXXX-XXXX or XXXX-XXXX-XXXX-XXXX using only uppercase letters and numbers.' 
        });
    }

    try {
        // 1. التأكد من وجود المنتج/المورد
        const resource = await Resource.findById(product_id);
        if (!resource) {
            return res.status(404).json({ message: 'Resource/Product not found.' });
        }

        // 2. التحقق من أن الكود غير موجود مسبقًا (سيتم البحث عنه بالواصلات)
        const existingCode = await ActivationCode.findOne({ code_value });
        if (existingCode) {
             return res.status(409).json({ message: 'Activation code already exists.' });
        }
        
        // 3. إنشاء الكود الجديد في قاعدة البيانات (سيتم حفظه بالواصلات)
        const newCode = new ActivationCode({
            code_value, // ✅ تخزين القيمة بالواصلات
            product_id,
            max_activations,
            expiry_date: expiry_date || null,
        });

        await newCode.save();

        res.status(201).json({
            message: 'Activation code created successfully',
            code: newCode,
        });
    } catch (error) {
        console.error('Error creating new activation code:', error);
        res.status(500).json({ message: 'Server error while creating code.' });
    }
};


// 2. GET /admin/activation-codes - جلب جميع الأكواد مع عدد المستخدمين (مُعدَّل ومُحسن)
const getAllCodes = async (req, res) => {
    try {
        // 🟢 تجميع البيانات:
        // 1. جلب جميع أكواد التفعيل
        // 2. ربطها بالـ Resource (المنتج) للحصول على اسم المنتج
        // 3. (افتراض) تجميع عدد مرات التفعيل لكل كود من موديل UserActivation

        const codes = await ActivationCode.aggregate([
            {
                // ربط بجدول Resource للحصول على اسم المنتج
                $lookup: {
                    from: 'resources', // اسم مجموعة الموديل Resource (عادة يكون اسم الموديل بصيغة الجمع والأحرف الصغيرة)
                    localField: 'product_id',
                    foreignField: '_id',
                    as: 'productDetails',
                },
            },
            {
                // فك ربط الـ Array لتفاصيل المنتج
                $unwind: {
                    path: '$productDetails',
                    preserveNullAndEmptyArrays: true // للحفاظ على الكود حتى لو لم يُعثر على منتج
                }
            },
            {
                // 🚧 ملاحظة هامة: يجب أن يتم إنشاء موديل UserActivation
                // هذا الجزء يعتمد على وجود موديل الاشتراكات/التفعيلات
                $lookup: {
                    from: 'useractivations', // اسم مجموعة موديل تتبع التفعيلات (افترضنا 'useractivations')
                    localField: '_id',
                    foreignField: 'code_id', // يجب أن يكون حقل ربط في موديل UserActivation يشير إلى ActivationCode
                    as: 'activations',
                },
            },
            {
                // إعادة تشكيل الإخراج ليكون نظيفاً
                $project: {
                    _id: 1,
                    code_value: 1,
                    max_activations: 1,
                    is_active: 1,
                    expiry_date: 1,
                    createdAt: 1,
                    // جلب اسم المنتج من تفاصيله
                    product_name: '$productDetails.title',
                    product_id: 1,
                    // حساب عدد التفعيلات (طول مصفوفة التفعيلات)
                    current_users: { $size: '$activations' },
                }
            },
            {
                // ترتيب أحدث الأكواد أولاً
                $sort: { createdAt: -1 }
            }
        ]);

        res.status(200).json(codes);
    } catch (error) {
        console.error('Error fetching activation codes:', error);
        res.status(500).json({ message: 'Server error while fetching codes.' });
    }
};


// 3. DELETE /admin/activation-codes/:codeId - حذف كود
const deleteCode = async (req, res) => {
    const { codeId } = req.params;

    // ⛔ التحقق من أن codeId هو معرف مونجو صالح
    if (!mongoose.Types.ObjectId.isValid(codeId)) {
        return res.status(400).json({ message: 'Invalid code ID format.' });
    }

    try {
        // 1. حذف الكود نفسه
        const code = await ActivationCode.findByIdAndDelete(codeId);

        if (!code) {
            return res.status(404).json({ message: 'Activation code not found.' });
        }

        const deletionResult = await UserActivation.deleteMany({

            code_id: codeId // أو الاسم الذي تستخدمه في موديل UserActivation
        });

        res.status(200).json({
            message: 'Activation code and associated activations deleted successfully.',
            deletedCode: code,
        });

    } catch (error) {
        console.error('Error deleting activation code:', error);
        res.status(500).json({ message: 'Server error while deleting code.' });
    }
};

const getAllActivations = async (req, res) => {
    try {
        const activations = await UserActivation.find({})
            .sort({ activation_date: -1 })
            // 💡 تعبئة بيانات الكود
            .populate({
                path: 'code_id',
                select: 'code_value product_id',
                // تعبئة المنتج داخل الكود (Nested Populate)
                populate: {
                    path: 'product_id',
                    select: 'title', // نستخدم 'title' من ResourceModel
                    model: 'Resource'
                }
            })
            // 💡 تعبئة بيانات المستخدم
            .populate({
                path: 'user_id',
                select: 'name email', // افترضنا أن المستخدم لديه حقول name و email
                model: 'User'
            });

        // 🟢 تجهيز البيانات للإرسال (اختياري لكن مفيد للتنظيف)
        const formattedActivations = activations.map(act => {

            // تحقق من وجود الكود
            const code = act.code_id || {};

            // تحقق من وجود المنتج
            const product = code.product_id || {};

            // تحقق من وجود المستخدم
            const user = act.user_id || {};

            return {
                _id: act._id,
                activation_date: act.activation_date,

                // تفاصيل الكود
                code_value: code.code_value || 'Code Deleted',
                product_name: product.title || 'Product Deleted',

                // تفاصيل المستخدم
                user_name: user.name || 'User Deleted',
                user_email: user.email || 'N/A',
                user_id: user._id || null,
            };
        });

        res.status(200).json(formattedActivations);
    } catch (error) {
        console.error("Error fetching user activations:", error);
        res.status(500).json({ message: "Failed to fetch user activations." });
    }
};

// DELETE /admin/user-activations/:activationId - حذف تفعيل معين
const deleteActivation = async (req, res) => {
    const { activationId } = req.params;

    try {
        const result = await UserActivation.findByIdAndDelete(activationId);

        if (!result) {
            return res.status(404).json({ message: "User activation record not found." });
        }

        res.status(200).json({ message: "User activation deleted successfully." });
    } catch (error) {
        console.error("Error deleting user activation:", error);
        res.status(500).json({ message: "Failed to delete user activation." });
    }
};


module.exports = {

    adminLogin,
    updateAdminPassword,
    AllUsers,
    DelUser,
    addResource,
    getAllResources,
    getResourceById,
    deleteResource,
    updateResource,
    createNewCode,
    getAllCodes,
    deleteCode,
    getAllActivations,
    deleteActivation,

};