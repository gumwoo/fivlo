const mongoose = require('mongoose');

const growthAlbumSchema = new mongoose.Schema({
  // 사용자 정보
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // 연결된 Task
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    required: true,
    index: true
  },

  // 이미지 정보
  imageUrl: {
    type: String,
    required: true
  },

  imagePath: {
    type: String, // 서버 내 실제 파일 경로
    required: true
  },

  imageSize: {
    type: Number, // 파일 크기 (bytes)
    default: 0
  },

  imageType: {
    type: String, // MIME 타입
    default: 'image/jpeg'
  },

  // 썸네일 정보
  thumbnailUrl: {
    type: String,
    default: null
  },

  thumbnailPath: {
    type: String,
    default: null
  },

  // 메모
  memo: {
    type: String,
    trim: true,
    maxlength: 500,
    default: ''
  },

  // 위치 정보 (선택사항)
  location: {
    latitude: {
      type: Number,
      default: null
    },
    longitude: {
      type: Number,
      default: null
    },
    address: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null
    }
  },

  // 태그
  tags: [{
    type: String,
    trim: true,
    maxlength: 20
  }],

  // 감정/기분
  mood: {
    type: String,
    enum: ['very_happy', 'happy', 'neutral', 'sad', 'very_sad', null],
    default: null
  },

  // 평점 (1-5)
  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },

  // 날씨 정보 (선택사항)
  weather: {
    condition: {
      type: String, // 'sunny', 'cloudy', 'rainy', etc.
      default: null
    },
    temperature: {
      type: Number,
      default: null
    }
  },

  // 공개 설정
  isPublic: {
    type: Boolean,
    default: false
  },

  // 즐겨찾기
  isFavorite: {
    type: Boolean,
    default: false
  },

  // 촬영 시간 (Task 완료 시간과 다를 수 있음)
  capturedAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
growthAlbumSchema.index({ userId: 1, createdAt: -1 });
growthAlbumSchema.index({ userId: 1, taskId: 1 });
growthAlbumSchema.index({ userId: 1, capturedAt: -1 });
growthAlbumSchema.index({ userId: 1, isFavorite: 1 });
growthAlbumSchema.index({ createdAt: -1 });

// 가상 필드
growthAlbumSchema.virtual('formattedDate').get(function() {
  return this.capturedAt.toISOString().split('T')[0]; // YYYY-MM-DD
});

growthAlbumSchema.virtual('hasLocation').get(function() {
  return this.location.latitude !== null && this.location.longitude !== null;
});

// 미들웨어: 이미지 삭제 시 실제 파일도 삭제
growthAlbumSchema.pre('deleteOne', { document: true, query: false }, async function() {
  try {
    const fs = require('fs').promises;
    const path = require('path');

    // 원본 이미지 삭제
    if (this.imagePath) {
      try {
        await fs.unlink(this.imagePath);
      } catch (error) {
        console.warn(`원본 이미지 삭제 실패: ${this.imagePath}`, error.message);
      }
    }

    // 썸네일 삭제
    if (this.thumbnailPath) {
      try {
        await fs.unlink(this.thumbnailPath);
      } catch (error) {
        console.warn(`썸네일 삭제 실패: ${this.thumbnailPath}`, error.message);
      }
    }
  } catch (error) {
    console.error('성장앨범 파일 삭제 오류:', error);
  }
});

// 정적 메서드: 사용자의 성장앨범 월별 조회
growthAlbumSchema.statics.getMonthlyAlbum = function(userId, year, month) {
  const startOfMonth = new Date(year, month - 1, 1);
  const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999);

  return this.find({
    userId,
    capturedAt: {
      $gte: startOfMonth,
      $lte: endOfMonth
    }
  })
  .populate('taskId', 'title categoryId')
  .sort({ capturedAt: -1 });
};

// 정적 메서드: 카테고리별 성장앨범 조회
growthAlbumSchema.statics.getAlbumByCategory = async function(userId, categoryId = null) {
  const pipeline = [
    {
      $match: { userId: new mongoose.Types.ObjectId(userId) }
    },
    {
      $lookup: {
        from: 'tasks',
        localField: 'taskId',
        foreignField: '_id',
        as: 'task'
      }
    },
    {
      $unwind: '$task'
    }
  ];

  // 특정 카테고리 필터링
  if (categoryId) {
    pipeline.push({
      $match: { 'task.categoryId': new mongoose.Types.ObjectId(categoryId) }
    });
  }

  pipeline.push(
    {
      $lookup: {
        from: 'categories',
        localField: 'task.categoryId',
        foreignField: '_id',
        as: 'category'
      }
    },
    {
      $unwind: '$category'
    },
    {
      $sort: { capturedAt: -1 }
    },
    {
      $group: {
        _id: '$category._id',
        categoryName: { $first: '$category.name' },
        categoryColor: { $first: '$category.color' },
        albums: { $push: '$$ROOT' },
        count: { $sum: 1 }
      }
    },
    {
      $sort: { count: -1 }
    }
  );

  return await this.aggregate(pipeline);
};

// 정적 메서드: 즐겨찾기 앨범 조회
growthAlbumSchema.statics.getFavoriteAlbums = function(userId) {
  return this.find({
    userId,
    isFavorite: true
  })
  .populate('taskId', 'title categoryId')
  .populate({
    path: 'taskId',
    populate: {
      path: 'categoryId',
      select: 'name color'
    }
  })
  .sort({ capturedAt: -1 });
};

// 정적 메서드: 성장앨범 통계
growthAlbumSchema.statics.getAlbumStats = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const stats = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        capturedAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$capturedAt' },
          month: { $month: '$capturedAt' },
          day: { $dayOfMonth: '$capturedAt' }
        },
        count: { $sum: 1 },
        totalSize: { $sum: '$imageSize' }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
    }
  ]);

  const totalStats = await this.aggregate([
    {
      $match: { userId: new mongoose.Types.ObjectId(userId) }
    },
    {
      $group: {
        _id: null,
        totalCount: { $sum: 1 },
        totalSize: { $sum: '$imageSize' },
        favoriteCount: {
          $sum: {
            $cond: [{ $eq: ['$isFavorite', true] }, 1, 0]
          }
        }
      }
    }
  ]);

  return {
    daily: stats,
    total: totalStats[0] || { totalCount: 0, totalSize: 0, favoriteCount: 0 }
  };
};

// 인스턴스 메서드: 즐겨찾기 토글
growthAlbumSchema.methods.toggleFavorite = function() {
  this.isFavorite = !this.isFavorite;
  return this.save();
};

// 인스턴스 메서드: 메모 업데이트
growthAlbumSchema.methods.updateMemo = function(memo) {
  this.memo = memo;
  return this.save();
};

// 인스턴스 메서드: 태그 추가
growthAlbumSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
    return this.save();
  }
  return Promise.resolve(this);
};

// 인스턴스 메서드: 태그 제거
growthAlbumSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

const GrowthAlbum = mongoose.model('GrowthAlbum', growthAlbumSchema);

module.exports = GrowthAlbum;
