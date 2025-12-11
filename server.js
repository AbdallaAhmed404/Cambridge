require('dotenv').config();
const express = require('express')
const cors = require('cors');
const app = express()
const connectDB = require('./conect')
const UserRouter = require('./routes/UserRouts')
const AdminRouter = require('./routes/AdminRouts')
const errorHandler = require('./middlewares/errorhandler');
const path = require('path');

app.use(cors());
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