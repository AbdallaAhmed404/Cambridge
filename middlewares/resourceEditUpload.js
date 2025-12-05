// middleware/resourceEditUpload.js (المفضل مع R2)
const multer = require("multer");

// 💡 نستخدم memoryStorage لعدم حفظ الملفات محلياً قبل الرفع إلى R2.
// هذا يسهل عملية Rollback (لا حاجة لحذف الملفات محلياً).
const storage = multer.memoryStorage(); 

const upload = multer({ 
    storage,
    limits: { fileSize: 1024 * 1024 * 500 }, // 500MB
});

const resourceEditUpload = upload.fields([
    { name: 'newPhoto', maxCount: 1 },    
    { name: 'newBook', maxCount: 1 },     
    { name: 'newAudios', maxCount: 500 },  
    { name: 'newVideos', maxCount: 500 }   
]);

module.exports = resourceEditUpload;