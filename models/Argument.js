const mongoose = require('mongoose');

const argumentSchema = new mongoose.Schema(
  {
    debate: { type: mongoose.Schema.Types.ObjectId, ref: 'Debate', required: true },
    side: { type: String, enum: ['for', 'against'], required: true },
    text: { type: String, required: true },
    authorName: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Argument', argumentSchema);
