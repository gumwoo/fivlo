const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

// 업로드 디렉토리 생성
const createUploadDirectories = async () => {
  const directories = [
    path.join(__dirname, '../../uploads'),
    path.join(__dirname, '../../uploads/growth-album'),
    path.join(__dirname, '../../uploads/growth-album/original'),
    path.join(__dirname, '../../uploads/growth-album/thumbnails')
  ];

  for (const dir of directories) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch (error) {
      console.error(`디렉토리 생성 실패: ${dir}`, error);
    }
  }
};

// 초기화 시 디렉토리 생성
createUploadDirectories();

// 파일 필터링 (이미지만 허용)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드 가능합니다. (JPEG, PNG, WebP)'), false);
  }
};

// 파일명 생성
const generateFileName = (userId, originalname) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 8);
  const extension = path.extname(originalname).toLowerCase();
  return `${userId}_${timestamp}_${randomString}${extension}`;
};

// Multer 설정 (메모리 저장)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.UPLOAD_MAX_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 1
  }
});

// 이미지 처리 미들웨어
const processImage = async (req, res, next) => {
  try {
    if (!req.file) {
      return next();
    }

    const userId = req.user._id;
    const fileName = generateFileName(userId, req.file.originalname);
    
    // 파일 경로 설정
    const originalPath = path.join(__dirname, '../../uploads/growth-album/original', fileName);
    const thumbnailPath = path.join(__dirname, '../../uploads/growth-album/thumbnails', `thumb_${fileName}`);
    
    // 원본 이미지 최적화 및 저장
    const originalInfo = await sharp(req.file.buffer)
      .rotate()
      .resize(1920, 1920, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ 
        quality: 85,
        progressive: true 
      })
      .toFile(originalPath);

    // 썸네일 생성
    const thumbnailInfo = await sharp(req.file.buffer)
      .rotate()
      .resize(300, 300, { 
        fit: 'cover',
        position: 'center' 
      })
      .jpeg({ 
        quality: 75 
      })
      .toFile(thumbnailPath);

    // URL 생성
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const originalUrl = `${baseUrl}/uploads/growth-album/original/${fileName}`;
    const thumbnailUrl = `${baseUrl}/uploads/growth-album/thumbnails/thumb_${fileName}`;

    // 요청 객체에 이미지 정보 추가
    req.imageInfo = {
      originalPath,
      thumbnailPath,
      originalUrl,
      thumbnailUrl,
      fileSize: originalInfo.size,
      mimeType: 'image/jpeg',
      width: originalInfo.width,
      height: originalInfo.height
    };

    logger.info('이미지 처리 완료', {
      userId,
      fileName,
      originalSize: req.file.size,
      processedSize: originalInfo.size
    });

    next();
  } catch (error) {
    logger.error(`이미지 처리 실패: ${error.message}`, {
      userId: req.user?._id,
      fileName: req.file?.originalname
    });

    res.status(400).json({
      error: '이미지 처리 중 오류가 발생했습니다.',
      message: error.message
    });
  }
};

// 업로드 에러 핸들링
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    let message = '파일 업로드 중 오류가 발생했습니다.';
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = '파일 크기가 너무 큽니다. 최대 10MB까지 업로드 가능합니다.';
        break;
      case 'LIMIT_FILE_COUNT':
        message = '한 번에 하나의 파일만 업로드 가능합니다.';
        break;
    }

    logger.warn('업로드 에러', {
      code: error.code,
      message: error.message,
      userId: req.user?._id
    });

    return res.status(400).json({
      error: message,
      code: error.code
    });
  }

  next(error);
};

module.exports = {
  upload: upload.single('image'),
  processImage,
  handleUploadError
};
