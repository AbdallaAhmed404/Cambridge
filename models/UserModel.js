// models/UserModel.js
const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')
const saltround = 10
const jwt = require('jsonwebtoken')
const util = require('util')
const sign = util.promisify(jwt.sign)
const JWT_SECRET = process.env.JWT_SECRET  // استخدم env في production
const __ = require('lodash')

const userSchema = new mongoose.Schema(
  {
    FirstName: { type: String },
    LastName: { type: String },
    Role: { type: String, enum: ['Student', 'Teacher'], default: 'Student' },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    // **حقول جديدة مضافة**
    SchoolName: { type: String },
    SchoolLocation: { type: String},
    // ************************

    isActive: { type: Boolean, default: false },
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    activationToken: String,
    activationExpires: Date
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        return __.omit(ret, ['__v', 'password', 'resetCode']);
      }
    }
  }
);

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const hashedPassword = await bcrypt.hash(this.password, saltround);
    this.password = hashedPassword;
    next();
  } catch (err) {
    console.error("Password hashing error:", err);
    next(err);
  }
});

// Token generation
userSchema.methods.generatetoken = async function () {
  const token = await sign({
    id: this._id,
    email: this.email,
    role: this.Role
  }, JWT_SECRET);
  return token;
};

const userModel = mongoose.model('User', userSchema);
module.exports = userModel;

// يجب أن يتم تعريف وظيفة register في ملف controller منفصل
// لكن قمت بتضمينها هنا لتسهيل التعديل كما في الكود الأصلي
// ... يتم تعريف دالة register في الخطوة التالية