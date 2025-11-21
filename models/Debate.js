const mongoose = require('mongoose');

const debateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Debate', debateSchema);
