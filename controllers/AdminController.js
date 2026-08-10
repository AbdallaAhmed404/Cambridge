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
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require('dotenv').config();



const R2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN;

const getUploadUrl = async (req, res) => {
    try {
        const { folder, filename, contentType } = req.body;
        if (!folder || !filename || !contentType) {
            return res.status(400).json({ message: "folder, filename and contentType are required." });
        }

        const fileKey = `${folder}${filename}`;
        const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: fileKey,
            ContentType: contentType,
            ACL: 'public-read'
        });

        const signedUrl = await getSignedUrl(R2, command, { expiresIn: 3600 });
        const publicUrl = `${R2_PUBLIC_DOMAIN}/${fileKey}`;

        return res.status(200).json({ signedUrl, publicUrl });
    } catch (error) {
        console.error("Error generating signed URL:", error);
        return res.status(500).json({ message: "Failed to generate signed URL." });
    }
};



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
        const { title, targetRole, photo, bookPath, pageAudios = [], pageVideos = [] , glossary = [] } = req.body;

        if (!title || !targetRole || !photo || !bookPath) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        const newResource = new Resource({
            title,
            targetRole,
            photo,   // URL من الفرونت
            bookPath,// URL من الفرونت
            pageAudios,
            pageVideos,
            glossary,
        });

        await newResource.save();
        return res.status(201).json({ message: "Resource added successfully", resource: newResource });

    } catch (error) {
        console.error("AddResource Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};

const addTeacherResources = async (req, res) => {
    try {
        // 🆕 استلام حقل digitalClassroom
        const { resourceId, answers = [], downloadableResources = [], digitalClassroom } = req.body;

        if (!resourceId) {
            return res.status(400).json({ message: "Resource ID is required for updating teacher resources." });
        }

        const resource = await Resource.findById(resourceId);
        if (!resource) {
            return res.status(404).json({ message: "Resource not found." });
        }
        
        // ------------------------------------------------------------------
        // منطق تحديث/إضافة الإجابات (Answers)
        // ------------------------------------------------------------------
        answers.forEach(newAnswer => {
            const existingAnswer = resource.answers.find(ans => ans.title === newAnswer.title);
            if (existingAnswer) {
                if (!existingAnswer.path.includes(newAnswer.path)) {
                    existingAnswer.path.push(newAnswer.path);
                }
            } else {
                resource.answers.push({
                    title: newAnswer.title,
                    path: [newAnswer.path]
                });
            }
        });

        // ------------------------------------------------------------------
        // منطق تحديث/إضافة الموارد القابلة للتحميل (Downloadable Resources)
        // ------------------------------------------------------------------
        downloadableResources.forEach(newResource => {
            const existingResource = resource.downloadableResources.find(res => res.title === newResource.title);

            if (existingResource) {
                if (!existingResource.path.includes(newResource.path)) {
                    existingResource.path.push(newResource.path);
                }
            } else {
                resource.downloadableResources.push({
                    title: newResource.title,
                    path: [newResource.path]
                });
            }
        });

        // ------------------------------------------------------------------
        // 🆕 منطق تحديث/إضافة الفصل الرقمي (Digital Classroom)
        // ------------------------------------------------------------------
        if (digitalClassroom) {
            // تحديث مسار PDF إذا تم إرساله
            if (digitalClassroom.pdfPath) {
                resource.digitalClassroom.pdfPath = digitalClassroom.pdfPath;
            }
            
            // إضافة ملفات الميديا الجديدة
            if (digitalClassroom.mediaFiles && Array.isArray(digitalClassroom.mediaFiles)) {
                digitalClassroom.mediaFiles.forEach(newMedia => {
                    // PageMediaItemSchema يحتوي على pageNumber و path
                    // نتحقق من عدم وجود ملف ميديا بنفس المسار ورقم الصفحة
                    const existingMedia = resource.digitalClassroom.mediaFiles.find(
                        media => media.pageNumber === newMedia.pageNumber && media.path === newMedia.path
                    );
                    
                    if (!existingMedia) {
                        resource.digitalClassroom.mediaFiles.push(newMedia);
                    }
                });
            }
        }

        resource.markModified('answers');
        resource.markModified('downloadableResources');
        // 🆕 وضع علامة التعديل على حقول الفصل الرقمي
        resource.markModified('digitalClassroom');
        resource.markModified('digitalClassroom.pdfPath'); 
        resource.markModified('digitalClassroom.mediaFiles'); 
        
        await resource.save();

        return res.status(200).json({ message: "Teacher resources and Digital Classroom updated successfully", resource });

    } catch (error) {
        console.error("AddTeacherResources Error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};


const getAllResources = async (req, res) => {
    try {
        // البحث عن جميع الموارد
        const resources = await Resource.find({})
            // تحديد الحقول المراد إظهارها في القائمة الرئيسية
            .select('_هي title targetRole photo pageAudios pageVideos answers downloadableResources digitalClassroom createdAt');

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

        // 1. استرجاع بيانات المورد
        const resource = await Resource.findById(resourceId);
        const activationid = await ActivationCode.find({ product_id: resourceId });

        if (!resource) {
            return res.status(404).json({ message: "Resource not found." });
        }

        // 2. تجميع جميع الـ URLs للحذف (بما في ذلك الحقول الجديدة)
        const filesToDelete = [
            resource.photo,
            resource.bookPath,
            
            // 🛑 الحقول القديمة
            ...resource.pageAudios.map(a => a.path),
            ...resource.pageVideos.map(v => v.path),
            
            // 🛑 الحقول الجديدة: Answers
            ...resource.answers.flatMap(ans => ans.path),
            
            // 🛑 الحقول الجديدة: Downloadable Resources
            ...resource.downloadableResources.flatMap(d => d.path),
            
            // 🛑 الحقول الجديدة: Digital Classroom (PDF + Media Files)
            resource.digitalClassroom.pdfPath,
            ...resource.digitalClassroom.mediaFiles.map(m => m.path)

        ].filter(url => url); // تصفية لضمان عدم إرسال قيم null/undefined

        // 3. حذف الملفات من R2 Cloud
        await Promise.all(
            filesToDelete.map(url => deleteFileFromR2(url))
        );
        
        // 4. حذف الـ Activation Code وسجلات تفعيل المستخدم
       if (activationid && activationid.length > 0) {
            
            // قائمة بـ _id لجميع أكواد التفعيل المرتبطة بهذا المورد
            const activationCodeIds = activationid.map(a => a._id);

            // 🛑 التصحيح هنا: استخدام 'code_id' بدلاً من 'activationCode'
            await UserActivation.deleteMany({ code_id: { $in: activationCodeIds } });

            // ثم حذف أكواد التفعيل نفسها
            await Promise.all(
                activationCodeIds.map(codeId => ActivationCode.findByIdAndDelete(codeId))
            );
        }
        // 5. حذف المورد من الداتابيز
        await Resource.findByIdAndDelete(resourceId);

        res.status(200).json({ message: "Resource and associated files deleted successfully from R2 and MongoDB." });

    } catch (err) {
        console.error("❌ Error deleting resource:", err);
        return res.status(500).json({ message: "Failed to delete resource and its files." });
    }
};

const deleteTeacherResourceSpecifics = async (req, res) => {
    try {
        const resourceId = req.body.id;

        const resource = await Resource.findById(resourceId);

        if (!resource) {
            return res.status(404).json({ message: "Resource not found." });
        }

        // 1. تجميع جميع الـ URLs الخاصة بموارد المُعلم فقط للحذف من R2
        const teacherFilesToDelete = [
            // Answers
            ...resource.answers.flatMap(ans => ans.path),
            
            // Downloadable Resources
            ...resource.downloadableResources.flatMap(d => d.path),
            
            // Digital Classroom (PDF + Media Files)
            resource.digitalClassroom.pdfPath,
            ...resource.digitalClassroom.mediaFiles.map(m => m.path)

        ].filter(url => url); // تصفية لضمان عدم إرسال قيم null/undefined

        // 2. حذف الملفات من R2 Cloud
        if (teacherFilesToDelete.length > 0) {
            console.log(`Deleting ${teacherFilesToDelete.length} teacher-specific files from R2.`);
            await Promise.all(
                teacherFilesToDelete.map(url => deleteFileFromR2(url))
            );
        }

        // 3. تحديث المورد في الداتابيز: تصفير حقول المعلم
        await Resource.findByIdAndUpdate(resourceId, {
            $set: {
                answers: [],
                downloadableResources: [],
                digitalClassroom: { 
                    pdfPath: null,
                    mediaFiles: [],
                }
            }
        });

        res.status(200).json({ 
            message: "Teacher-specific resources deleted successfully from R2 and cleared from MongoDB." 
        });

    } catch (err) {
        console.error("❌ Error deleting teacher-specific resources:", err);
        return res.status(500).json({ message: "Failed to delete teacher-specific resources." });
    }
};

// يجب إضافة الدالة الجديدة إلى exports في ملف المتحكم
// module.exports = { deleteResource, deleteTeacherResourceSpecifics, ... };

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

const deleteSpecificResourceItem = async (req, res) => {
    try {
        const { resourceId, type, title, filePath } = req.body;

        const resource = await Resource.findById(resourceId);
        if (!resource) return res.status(404).json({ message: "Resource not found" });

        // --- الحالة الأولى: حذف ملف واحد محدد (بالتحديد عبر المسار) ---
        if (filePath) {
            await deleteFileFromR2(filePath);

            if (type === 'answers' || type === 'downloadableResources') {
                const item = resource[type].find(i => i.title === title);
                if (item) {
                    item.path = item.path.filter(p => p !== filePath);
                    if (item.path.length === 0) {
                        resource[type] = resource[type].filter(i => i.title !== title);
                    }
                }
            } 
            else if (type === 'digitalClassroomMedia') {
                if (resource.digitalClassroom && resource.digitalClassroom.mediaFiles) {
                    resource.digitalClassroom.mediaFiles = resource.digitalClassroom.mediaFiles.filter(m => m.path !== filePath);
                }
            } 
            else if (type === 'digitalClassroomPdf') {
                if (resource.digitalClassroom) {
                    resource.digitalClassroom.pdfPath = null;
                }
            }
        } 
        // --- الحالة الثانية: حذف مجموعة بالكامل (مثل حذف كل ملفات Page 5 أو Unit 1) ---
        else if (title) {
            if (type === 'answers' || type === 'downloadableResources') {
                const itemToDelete = resource[type].find(i => i.title === title);
                if (itemToDelete) {
                    await Promise.all(itemToDelete.path.map(p => deleteFileFromR2(p)));
                    resource[type] = resource[type].filter(i => i.title !== title);
                }
            } 
            else if (type === 'digitalClassroomMedia') {
                // هنا نقوم بفلترة الميديا بناءً على رقم الصفحة المستخرج من العنوان (Page 5)
                const pageNum = parseInt(title.replace('Page ', ''));
                
                if (resource.digitalClassroom && resource.digitalClassroom.mediaFiles) {
                    const filesToDelete = resource.digitalClassroom.mediaFiles.filter(m => m.pageNumber === pageNum);
                    await Promise.all(filesToDelete.map(f => deleteFileFromR2(f.path)));
                    
                    resource.digitalClassroom.mediaFiles = resource.digitalClassroom.mediaFiles.filter(m => m.pageNumber !== pageNum);
                }
            }
        }

        // إخطار Mongoose بالتغييرات
        resource.markModified('answers');
        resource.markModified('downloadableResources');
        resource.markModified('digitalClassroom');
        
        await resource.save();
        res.status(200).json({ message: "Item deleted successfully", resource });
    } catch (error) {
        console.error("Delete Item Error:", error);
        res.status(500).json({ message: "Server error during deletion" });
    }
};

const addGlossaryItems = async (req, res) => {
    try {
        const { resourceId, glossary = [] } = req.body;

        if (!resourceId || glossary.length === 0) {
            return res.status(400).json({ message: "Resource ID and glossary items are required." });
        }

        const resource = await Resource.findById(resourceId);
        if (!resource) return res.status(404).json({ message: "Resource not found" });

        // إضافة العناصر الجديدة للمصفوفة الحالية
        resource.glossary.push(...glossary);
        
        await resource.save();
        res.status(200).json({ message: "Glossary items added successfully", resource });
    } catch (error) {
        console.error("Add Glossary Items Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};

// 2. حذف عنصر واحد محدد من القاموس
const deleteGlossaryItem = async (req, res) => {
    try {
        const { resourceId, itemId, imageUrl } = req.body;

        const resource = await Resource.findById(resourceId);
        if (!resource) return res.status(404).json({ message: "Resource not found" });

        // 1. حذف الصورة من R2 إذا وجدت
        if (imageUrl) {
            await deleteFileFromR2(imageUrl);
        }

        // 2. حذف العنصر من المصفوفة في قاعدة البيانات
        resource.glossary = resource.glossary.filter(item => item._id.toString() !== itemId);
        
        await resource.save();
        res.status(200).json({ message: "Glossary item deleted successfully", resource });
    } catch (error) {
        console.error("Delete Glossary Item Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
const addDigitalGlossaryItems = async (req, res) => {
    try {
        const { resourceId, glossary = [] } = req.body;
        const resource = await Resource.findById(resourceId);
        if (!resource) return res.status(404).json({ message: "Resource not found" });

        resource.digitalGlossary.push(...glossary);
        await resource.save();
        res.status(200).json({ message: "Digital glossary updated", resource });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const deleteDigitalGlossaryItem = async (req, res) => {
    try {
        const { resourceId, itemId, imageUrl } = req.body;
        const resource = await Resource.findById(resourceId);
        if (!resource) return res.status(404).json({ message: "Resource not found" });

        if (imageUrl) await deleteFileFromR2(imageUrl);
        resource.digitalGlossary = resource.digitalGlossary.filter(item => item._id.toString() !== itemId);
        
        await resource.save();
        res.status(200).json({ message: "Deleted from digital glossary", resource });
    } catch (error) { res.status(500).json({ message: error.message }); }
};

const ToggleUserActive = async (req, res, next) => {
    try {
        const { id } = req.params;

        // البحث عن المستخدم وتحديث حالة isActive إلى true (أو عكسها حسب رغبتك، هنا هنخليها تفعيل مباشر)
        const user = await UserModel.findByIdAndUpdate(
            id,
            { isActive: true },
            { new: true, runValidators: true }
        );

        if (!user) {
            return next(customError({
                statusCode: 404,
                message: "User not found"
            }));
        }

        res.status(200).json({
            status: "success",
            message: "User activated successfully",
            data: user
        });
    } catch (err) {
        console.error("Error activating user:", err);
        return next(customError({
            statusCode: 500,
            message: "Failed to update user status"
        }));
    }
}

const renewUserActivation = async (req, res) => {
  try {
    const activationId = req.params.id;

    // تحديث تاريخ التفعيل ليصبح وقت الضغط (الآن)
    const updatedActivation = await UserActivation.findByIdAndUpdate(
      activationId,
      { activation_date: Date.now() },
      { new: true } // بيخلي Mongoose يرجع السجل بعد ما اتحدث
    );

    if (!updatedActivation) {
      return res.status(404).json({ message: "Activation record not found." });
    }

    return res.status(200).json({
      message: "Activation renewed successfully",
      activation_date: updatedActivation.activation_date
    });

  } catch (error) {
    console.error("Renew Activation Error:", error);
    return res.status(500).json({ message: "Server error during activation renewal." });
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
    getUploadUrl,
    addTeacherResources,
    deleteTeacherResourceSpecifics,
    deleteSpecificResourceItem,
    addGlossaryItems,
    deleteGlossaryItem,
    addDigitalGlossaryItems,
    deleteDigitalGlossaryItem,
    ToggleUserActive,
    renewUserActivation,
};