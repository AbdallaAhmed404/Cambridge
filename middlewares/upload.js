// middleware/upload.js
const multer = require("multer");
// const path = require("path"); // لم نعد نحتاجه

// 🚨 التغيير الأساسي: استخدام multer.memoryStorage
// هذا سيخزن الملفات في ذاكرة الخادم مؤقتاً قبل إرسالها إلى R2.
// هذا ضروري لأننا لا نستطيع استخدام التخزين المحلي (diskStorage) على Railway.
const storage = multer.memoryStorage();

const upload = multer({ 
    storage,
    // تم زيادة حجم الملف الأقصى (500MB) ليتناسب مع ملفات الفيديو والصوت المتعددة
    limits: { fileSize: 1024 * 1024 * 500 }, 
});

// 1. خاص بتحميل الموارد المتعددة (Add Resource)
const resourceUpload = upload.fields([
    { name: 'coverPhoto', maxCount: 1 },
    { name: 'bookFile', maxCount: 1 },
    { name: 'pageAudioFiles', maxCount: 500 }, 
    { name: 'pageVideoFiles', maxCount: 500 } 
]);

// 2. خاص بملف واحد عام (مثل Contact Form)
const singleUpload = upload.single('attachment');

module.exports = { resourceUpload, singleUpload };