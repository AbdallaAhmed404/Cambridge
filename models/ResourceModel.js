// models/ResourceModel.js
const mongoose = require('mongoose');

const TeacherResource = new mongoose.Schema({
    title: { 
        type: String, 
        required: true,
        trim: true,
    },
    path: { // مسار الملف (سواء كان صوت، فيديو، ملف إجابات، أو مورد قابل للتحميل)
        type: [String], 
        default: [],
    },
});

// تعريف هيكل البيانات لوسائط الصفحة الواحدة (للفصل الرقمي، الصوتيات، والفيديوهات)
const PageMediaItemSchema = new mongoose.Schema({
    pageNumber: { // رقم الصفحة المرتبط بالملف
        type: Number,
        required: true,
    },
    path: { // مسار الملف (صوت، فيديو، أو أي ملف ميديا للفصل الرقمي)
        type: String,
        required: true,
    },
});


const GlossaryItemSchema = new mongoose.Schema({
    term: { // الكلمة أو المصطلح
        type: String,
        required: true,
    },
    description: { // الشرح
        type: String,
        required: false,
    },
    image: { // صورة المصطلح (اختياري)
        type: String,
        default: null,
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
        required: true, 
        enum: ['Student', 'Teacher'],
    },
    photo: { 
        type: String, 
        required: true,
    },
    bookPath: {
        type: String, 
        required: true,
    },
    
    pageAudios: {
        type: [PageMediaItemSchema],
        default: [],
    },
    
    pageVideos: {
        type: [PageMediaItemSchema],
        default: [],
    },

    glossary: {
        type: [GlossaryItemSchema],
        default: [],
    },
    
    answers: {
        type: [TeacherResource],
        default: [],
    },
    
    downloadableResources: {
        type: [TeacherResource],
        default: [],
    },

    // 🆕 حقل جديد للفصل الرقمي (Digital Classroom)
    digitalClassroom: {
        type: {
            pdfPath: { // مسار ملف الـ PDF الأساسي للفصل الرقمي
                type: String,
                default: null,
            },
            mediaFiles: { // مصفوفة لملفات الميديا المرتبطة بالصفحات
                type: [PageMediaItemSchema], 
                default: [],
            },
        },
        default: { 
            pdfPath: null,
            mediaFiles: [],
        },
        required: false,
    },

    createdAt: {
        type: Date,
        default: Date.now,
    }
});

const Resource = mongoose.model('Resource', resourceSchema);
module.exports = Resource;