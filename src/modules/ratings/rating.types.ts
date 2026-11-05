import type { ObjectId } from 'mongodb';

export interface Rating {
  _id: ObjectId;
  bookId: ObjectId;
  userId: string;
  rating: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface RatingSummary {
  averageRating: number;
  totalRatings: number;
  distribution: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

export interface RatingEligibility {
  canRate: boolean;
  userRating: number | null;
}
