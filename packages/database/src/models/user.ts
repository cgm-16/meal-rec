// ABOUTME: Mongoose schema and model for user entities
// ABOUTME: Defines user structure with authentication and preferences

import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  hashedPin: string;
  preferences?: {
    spiciness?: number;
    surpriseFactor?: number;
    ingredientsToAvoid?: string[];
  };
}

const UserSchema = new Schema<IUser>({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  hashedPin: { 
    type: String, 
    required: true 
  },
  preferences: {
    spiciness: { 
      type: Number, 
      min: 0, 
      max: 5 
    },
    surpriseFactor: { 
      type: Number, 
      min: 0, 
      max: 10 
    },
    ingredientsToAvoid: [String]
  }
}, {
  timestamps: true
});

export const User = mongoose.model<IUser>('User', UserSchema);