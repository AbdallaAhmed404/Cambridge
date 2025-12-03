// middleware/upload.js
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = "uploads/"; // المجلد الرئيسي الافتراضي

        // 🆕 1. توجيه خاص لنموذج الموارد (Resource Form)
        if (file.fieldname === 'coverPhoto') {
            folder = 'uploads/covers/';
        } else if (file.fieldname === 'bookFile') {
            folder = 'uploads/books/';
        } 
        // 👇 الحقول الجديدة التي تستقبل ملفات متعددة (مصفوفات)
        else if (file.fieldname === 'pageAudioFiles') { 
            folder = 'uploads/audio/';
        } else if (file.fieldname === 'pageVideoFiles') { 
            folder = 'uploads/video/';
        } 
        // 🆕 2. توجيه خاص بنموذج المساعدة (Contact Form)
        else if (file.fieldname === 'attachment') {
            folder = 'uploads/attachments/';
        }
        
        // 🚨 تأكد من إنشاء هذه المجلدات: uploads/covers/, uploads/books/, uploads/audio/, uploads/video/, uploads/attachments/

        cb(null, folder);
    },
    
    filename: (req, file, cb) => {
        // تسمية الملف: اسم الحقل + الوقت + الامتداد
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ 
    storage,
    // تم زيادة حجم الملف الأقصى (500MB) ليتناسب مع ملفات الفيديو والصوت المتعددة
    limits: { fileSize: 1024 * 1024 * 500 }, 
});

// 1. خاص بتحميل الموارد المتعددة (Add Resource)
const resourceUpload = upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'bookFile', maxCount: 1 },
    // 🆕 حقول منفصلة لاستقبال الملفات
    { name: 'pageAudioFiles', maxCount: 500 }, 
    { name: 'pageVideoFiles', maxCount: 500 } 
]);

// 2. خاص بملف واحد عام (مثل Contact Form)
const singleUpload = upload.single('attachment');

module.exports = { resourceUpload, singleUpload };