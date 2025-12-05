// utils/r2Upload.js
const { S3Client, PutObjectCommand ,DeleteObjectCommand} = require("@aws-sdk/client-s3");
require('dotenv').config(); // تأكد من وجود ملف .env إذا كنت تختبر محلياً

// إعداد R2 Client
const R2 = new S3Client({
    region: "auto", // هذه القيمة ثابتة لـ Cloudflare R2
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_DOMAIN = process.env.R2_PUBLIC_DOMAIN;

/**
 * دالة لرفع ملف واحد إلى R2
 * @param {Object} file - كائن الملف من Multer (يحتوي على buffer)
 * @param {string} folder - اسم المجلد داخل الـ Bucket (مثل: 'covers/', 'books/')
 * @returns {string} - رابط الوصول العام للملف المرفوع
 * @param {string} fileUrl
 */

const uploadFileToR2 = async (file, folder) => {
    if (!file || !file.buffer) {
        throw new Error("Invalid file object provided for R2 upload.");
    }

    // 1. تحديد اسم الملف الفريد
    const fileExtension = file.originalname.split('.').pop();
    const fileName = `${folder}${file.fieldname}-${Date.now()}.${fileExtension}`;

    // 2. إعداد أمر الرفع
    const uploadCommand = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: fileName, // المسار والاسم داخل الـ Bucket
        Body: file.buffer, // محتوى الملف (من ذاكرة Multer)
        ContentType: file.mimetype, // نوع الملف (مهم للعرض الصحيح)
        ACL: 'public-read', // إعداد الوصول العام للملف (Public Read)
    });

    // 3. تنفيذ الرفع
    await R2.send(uploadCommand);

    // 4. بناء الـ URL العام (باستخدام الدومين العام الذي قمت بإعداده)
    const publicUrl = `${R2_PUBLIC_DOMAIN}/${fileName}`;
    
    return publicUrl;
};
const deleteFileFromR2 = async (fileUrl) => {
    if (!fileUrl || !R2_PUBLIC_DOMAIN) return;

    // 1. استخراج الـ Key/FileName من الـ URL
    // مثال: https://pub-xxx.r2.dev/covers/file.jpg  ->  covers/file.jpg
    const key = fileUrl.replace(`${R2_PUBLIC_DOMAIN}/`, '');

    if (!key) {
        console.warn(`Could not extract key from URL: ${fileUrl}`);
        return;
    }

    try {
        const deleteCommand = new DeleteObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: key, // الـ Key الذي تم استخراجه
        });

        await R2.send(deleteCommand);
        console.log(`✅ Successfully deleted file from R2: ${key}`);
    } catch (error) {
        // في حال كان الملف غير موجود (404)، لا نوقف عملية الحذف
        console.error(`❌ Failed to delete R2 object ${key}:`, error);
        // يمكننا تجاهل الخطأ إذا كان "NoSuchKey"
        if (error.Code !== 'NoSuchKey') {
             throw error; 
        }
    }
};
module.exports = { uploadFileToR2,deleteFileFromR2 };