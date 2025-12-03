const mongoose = require('mongoose');

const connect = async () => {
    try {
        // استخدام متغير البيئة MONGO_URI بدلاً من السلسلة الثابتة
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Atlas connected successfully');
    } catch (err) {
        console.error('Error connecting to MongoDB Atlas:', err.message);
        // إضافة هذا السطر لإيقاف التطبيق إذا فشل الاتصال بقاعدة البيانات
        process.exit(1); 
    }
};

module.exports = connect;