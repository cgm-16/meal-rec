// ABOUTME: Mongoose schema and model for user feedback on meals
// ABOUTME: Tracks user preferences with like/interested/dislike feedback

import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFeedback extends Document {
  user: Types.ObjectId;
  meal: Types.ObjectId;
  type: 'like' | 'interested' | 'dislike';
  timestamp: Date;
}

const FeedbackSchema = new Schema<IFeedback>({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  meal: { 
    type: Schema.Types.ObjectId, 
    ref: 'Meal', 
    required: true,
    index: true
  },
  type: { 
    type: String, 
    enum: ['like', 'interested', 'dislike'], 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

FeedbackSchema.index({ user: 1, meal: 1 }, { unique: true });

export const Feedback = mongoose.models.Feedback || mongoose.model<IFeedback>('Feedback', FeedbackSchema);