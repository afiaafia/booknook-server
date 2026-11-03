import express, { Router } from 'express';
import type { RequestHandler, Router as ExpressRouter } from 'express';

import { authenticate } from '../../middleware/authenticate.js';
import { uploadImage } from './image-upload.service.js';

export const uploadRoutes: ExpressRouter = Router();

const parseImageBody: RequestHandler = (req, res, next) => {
  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({
      success: false,
      message: 'Send an image file as the request body',
      error: { code: 'INVALID_IMAGE' },
    });
    return;
  }
  next();
};

uploadRoutes.post(
  '/image',
  authenticate,
  express.raw({
    type: ['image/jpeg', 'image/png', 'image/webp'],
    limit: '500kb',
  }),
  parseImageBody,
  async (req, res) => {
    const imageUrl = await uploadImage(
      req.body as Buffer,
      req.headers['content-type'] ?? ''
    );

    res.status(201).json({
      success: true,
      message: 'Image uploaded successfully',
      data: { imageUrl },
    });
  }
);
