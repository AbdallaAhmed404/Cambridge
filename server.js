require('dotenv').config();
const express = require('express')
const cors = require('cors');
const app = express()
const connectDB = require('./conect')
const UserRouter = require('./routes/UserRouts')
const AdminRouter = require('./routes/AdminRouts')
const errorHandler = require('./middlewares/errorhandler');
const path = require('path');

const allowedOrigins = [
  'https://cambridgeksa.org', 
  'http://localhost:3000' // للسماح أيضًا بالاختبار المحلي
];

const corsOptions = {
  origin: (origin, callback) => {
    // السماح إذا كان الأصل في القائمة المسموح بها، أو إذا لم يكن هناك أصل (كما هو الحال في Postman)
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      // يمكنك تعديل رسالة الخطأ لتكون أكثر تفصيلاً
      callback(new Error('Not allowed by CORS')); 
    }
  },
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true, // مهم إذا كنت تستخدم ملفات تعريف الارتباط (Cookies)
};

app.use(cors(corsOptions));
app.use(express.json())
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/user',UserRouter)
app.use('/admin',AdminRouter)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB(); 

app.listen(PORT,()=>{
    console.log(`Server is running on port ${PORT}`);
});