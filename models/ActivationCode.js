// /models/ActivationCode.js
const mongoose = require('mongoose');

const activationCodeSchema = new mongoose.Schema({
    code_value: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        minlength: 12, 
    },
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Resource', // المرجع
    },
    max_activations: {
        type: Number,
        required: true,
        default: 9999999, 
        min: 9999999
    },
    is_active: {
        type: Boolean,
        default: true,
    },
    expiry_date: {
        type: Date,
        default: null, 
    },
    // يمكن إضافة created_by هنا إذا أردت تتبع من قام بإنشاء الكود
}, { timestamps: true });

module.exports = mongoose.model('ActivationCode', activationCodeSchema);