// middleware/resourceEditUpload.js (الكود المصحح)
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let folder = "uploads/"; // المجلد الرئيسي الافتراضي

        // 🚨 يجب توجيه الملفات بناءً على أسماء الحقول الجديدة المستخدمة في عملية التعديل (NewPhoto, NewBook, إلخ)

        if (file.fieldname === 'newPhoto') {
            folder = 'uploads/covers/'; // نفس مسار الغلاف في upload.js
        } else if (file.fieldname === 'newBook') {
            folder = 'uploads/books/';  // نفس مسار الكتاب في upload.js
        } 
        // 👇 الملفات الصوتية والفيديو الجديدة المضافة للصفحات
        else if (file.fieldname === 'newAudios') { 
            folder = 'uploads/audio/';  // نفس مسار الصوت في upload.js
        } else if (file.fieldname === 'newVideos') { 
            folder = 'uploads/video/';  // نفس مسار الفيديو في upload.js
        } 
        
        // 🚨 تأكد من إنشاء هذه المجلدات: uploads/covers/, uploads/books/, uploads/audio/, uploads/video/

        cb(null, folder);
    },
    
    filename: (req, file, cb) => {
        // تسمية الملف: اسم الحقل + الوقت + الامتداد
        cb(null, file.fieldname + "-" + Date.now() + path.extname(file.originalname));
    },
});

const upload = multer({ 
    storage,
    // زيادة حجم الملف الأقصى (500MB) ليتناسب مع ملفات الفيديو والصوت المتعددة
    limits: { fileSize: 1024 * 1024 * 500 }, 
});

// 💡 Multer MiddleWare للتعديل
const resourceEditUpload = upload.fields([
    { name: 'newPhoto', maxCount: 1 },    // ملف صورة الغلاف الجديد (يذهب إلى covers/)
    { name: 'newBook', maxCount: 1 },     // ملف الكتاب PDF الجديد (يذهب إلى books/)
    { name: 'newAudios', maxCount: 500 },  // ملفات صوت جديدة مضافة (تذهب إلى audio/)
    { name: 'newVideos', maxCount: 500 }   // ملفات فيديو جديدة مضافة (تذهب إلى video/)
]);

module.exports = resourceEditUpload;