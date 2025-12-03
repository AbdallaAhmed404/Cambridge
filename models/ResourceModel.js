// models/ResourceModel.js
const mongoose = require('mongoose');

// تعريف هيكل البيانات لوسائط الصفحة الواحدة (للسهولة يمكن دمج الصوت والفيديو في هيكل واحد)
// سنقوم بإنشاء هيكل بسيط لتخزين رقم الصفحة والمسار
const PageMediaItemSchema = new mongoose.Schema({
    pageNumber: { // رقم الصفحة المرتبط بالملف
        type: Number,
        required: true,
    },
    path: { // مسار الملف (سواء كان صوت أو فيديو)
        type: String,
        required: true,
    },
});

const resourceSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true,
    },
    targetRole: {
        type: String,
        required: true, // جعله مطلوبًا
        enum: ['Student', 'Teacher'], // تحديد القيم الممكنة (طالب أو معلم بالإنجليزية
    },
    // مسار صورة الغلاف المحفوظة على الخادم (ملف واحد)
    photo: { 
        type: String, 
        required: true,
    },
    // مسار ملف الكتاب/PDF المحفوظ على الخادم (ملف واحد)
    bookPath: {
        type: String, 
        required: true,
    },
    
    // 🆕 حقل جديد لملفات الصوت المرتبطة بالصفحات
    pageAudios: {
        type: [PageMediaItemSchema],
        default: [],
    },
    
    // 🆕 حقل جديد لملفات الفيديو المرتبطة بالصفحات
    pageVideos: {
        type: [PageMediaItemSchema],
        default: [],
    },
    
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

const Resource = mongoose.model('Resource', resourceSchema);
module.exports = Resource;