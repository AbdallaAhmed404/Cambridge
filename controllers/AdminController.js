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
        // 🆕 استقبال أرقام الصفحات الخاصة بالصوت والفيديو بشكل منفصل
        const { title, targetRole, audioPageNumbers = [], videoPageNumbers = [] } = req.body;
        const files = req.files;

        // 1. التأكد من وجود البيانات الأساسية
        if (!title || !targetRole || !files || !files.coverPhoto || !files.bookFile) {
            return res.status(400).json({ message: "Title, Cover photo, targetRole, and Book file (PDF) are required." });
        }

        const coverPhotoPath = files.coverPhoto[0].path.replace(/\\/g, '/');
        const bookPath = files.bookFile[0].path.replace(/\\/g, '/');

        const audioFiles = files.pageAudioFiles || [];
        const videoFiles = files.pageVideoFiles || [];

        // 2. التحقق من تطابق أعداد ملفات الصوت وأرقام الصفحات
        if (audioFiles.length !== audioPageNumbers.length) {
            return res.status(400).json({ message: "Mismatch between audio file count and audio page number count." });
        }

        // 3. التحقق من تطابق أعداد ملفات الفيديو وأرقام الصفحات
        if (videoFiles.length !== videoPageNumbers.length) {
            return res.status(400).json({ message: "Mismatch between video file count and video page number count." });
        }

        // 4. تجهيز مصفوفة الصوت (pageAudios)
        const pageAudiosArray = audioFiles.map((file, index) => ({
            pageNumber: parseInt(audioPageNumbers[index]),
            path: file.path.replace(/\\/g, '/'),
        }));

        // 5. تجهيز مصفوفة الفيديو (pageVideos)
        const pageVideosArray = videoFiles.map((file, index) => ({
            pageNumber: parseInt(videoPageNumbers[index]),
            path: file.path.replace(/\\/g, '/'),
        }));

        // 6. إنشاء المورد وحفظه
        const newResource = new Resource({
            title,
            targetRole,
            photo: coverPhotoPath,
            bookPath: bookPath,
            pageAudios: pageAudiosArray, // الحقل الجديد
            pageVideos: pageVideosArray, // الحقل الجديد
        });

        await newResource.save();

        return res.status(201).json({
            message: "Resource added successfully with separated page media.",
            resource: newResource
        });

    } catch (error) {
        console.error("❌ Add Resource Error:", error);
        return res.status(500).json({ message: "Server error during resource addition." });
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
        // يتم إرسال _id المورد في body لـ DELETE
        const resourceId = req.body.id;

        const resource = await Resource.findById(resourceId);
        const activationid = await ActivationCode.find({ product_id: resourceId });

        if (!resource) {
            return res.status(404).json({ message: "Resource not found." });
        }

        // 🚨 خطوة مهمة: حذف الملفات المرتبطة من الخادم (اختياري لكن موصى به)
        const filesToDelete = [
            resource.photo,
            resource.bookPath,
            ...resource.pageAudios.map(a => a.path),
            ...resource.pageVideos.map(v => v.path)
        ];

        filesToDelete.forEach(filePath => {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });

        if (activationid) {
            await UserActivation.findOneAndDelete(activationid._id);
        }
        await Resource.findByIdAndDelete(resourceId);
        await ActivationCode.findOneAndDelete(activationid);

        res.status(200).json({ message: "Resource and associated files deleted successfully." });

    } catch (err) {
        console.error("Error deleting resource:", err);
        return res.status(500).json({ message: "Failed to delete resource." });
    }
};

// =======================================================
// 3. تعديل مورد (Update Resource)
// =======================================================
// ملاحظة: دالة التعديل هنا تتعامل مع البيانات النصية (title, author) ومسارات الوسائط فقط.
// إضافة/حذف ملفات الوسائط الجديدة ستكون عملية منفصلة في الواجهة الأمامية.
const updateResource = async (req, res) => {
    try {
        const resourceId = req.body.id;
        const resource = await Resource.findById(resourceId);

        if (!resource) {
            // 🚨 يجب حذف الملفات التي رفعها Multer للتو إذا لم نجد المورد!
            if (req.files) {
                Object.values(req.files).flat().forEach(file => fs.unlinkSync(file.path));
            }
            return res.status(404).json({ message: 'Resource not found' });
        }

        // =======================================================
        // 1. التعامل مع حذف الملفات الفعلية القديمة
        // =======================================================

        // 1.1. حذف الغلاف القديم إذا تم رفع غلاف جديد
        if (req.files.newPhoto && resource.photo) {
            fs.unlinkSync(resource.photo);
            resource.photo = req.files.newPhoto[0].path.replace(/\\/g, '/');
        }

        // 1.2. حذف ملف الكتاب القديم إذا تم رفع كتاب جديد
        if (req.files.newBook && resource.bookPath) {
            fs.unlinkSync(resource.bookPath);
            resource.bookPath = req.files.newBook[0].path.replace(/\\/g, '/');
        }

        // 1.3. حذف الوسائط الفعلية التي تم إزالتها من القائمة

        // المسارات المتبقية (أرسلها الفرونت إند)
        const newPageAudios = JSON.parse(req.body.pageAudios || '[]');
        const newPageVideos = JSON.parse(req.body.pageVideos || '[]');

        // المسارات التي يجب حذفها (الموجودة في القديم وغير موجودة في الجديد)
        const oldAudioPaths = resource.pageAudios.map(a => a.path);
        const oldVideoPaths = resource.pageVideos.map(v => v.path);

        const pathsToKeep = [...newPageAudios.map(a => a.path), ...newPageVideos.map(v => v.path)];

        const deletedAudioPaths = oldAudioPaths.filter(path => !pathsToKeep.includes(path));
        const deletedVideoPaths = oldVideoPaths.filter(path => !pathsToKeep.includes(path));

        // تنفيذ الحذف الفعلي
        [...deletedAudioPaths, ...deletedVideoPaths].forEach(filePath => {
            if (filePath && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });

        // =======================================================
        // 2. تحديث المورد بالبيانات النصية والمسارات الجديدة
        // =======================================================

        // 2.1. تحديث الحقول النصية
        resource.title = req.body.title || resource.title;
        if (req.body.targetRole) {
            resource.targetRole = req.body.targetRole;
        }
        

        // 2.2. تحديث الوسائط: (المتبقية من القديمة + المضافة حديثاً)

        // دمج المسارات الجديدة المرفوعة (إذا وجدت) مع البيانات النصية المرسلة
        const uploadedAudios = req.files.newAudios || [];
        const uploadedVideos = req.files.newVideos || [];

        // تحويل المسارات المرفوعة إلى الشكل الذي يتوقعه النموذج { pageNumber, path }
        const newAudiosWithPages = uploadedAudios.map(file => ({
            pageNumber: req.body[`pageNumber_audio_${file.originalname.split('.')[0]}`] || 0, // يجب أن ترسل الصفحة
            path: file.path.replace(/\\/g, '/')
        }));

        const newVideosWithPages = uploadedVideos.map(file => ({
            pageNumber: req.body[`pageNumber_video_${file.originalname.split('.')[0]}`] || 0, // يجب أن ترسل الصفحة
            path: file.path.replace(/\\/g, '/')
        }));

        // دمج كل المسارات
        resource.pageAudios = [...newPageAudios, ...newAudiosWithPages];
        resource.pageVideos = [...newPageVideos, ...newVideosWithPages];

        // 2.3. حفظ المورد
        await resource.save();
        
        res.status(200).json({ message: "Resource updated successfully.", resource });

    } catch (err) {
        console.error("Error updating resource:", err);
        // 🚨 حذف أي ملفات تم رفعها بواسطة Multer في حالة فشل أي خطوة لاحقة
        if (req.files) {
            Object.values(req.files).flat().forEach(file => {
                if (fs.existsSync(file.path)) {
                    fs.unlinkSync(file.path);
                }
            });
        }
        return res.status(500).json({ message: "Failed to update resource." });
    }
}



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