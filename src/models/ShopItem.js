const mongoose = require('mongoose');

const shopItemSchema = new mongoose.Schema({
  // 아이템 기본 정보
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },

  description: {
    type: String,
    trim: true,
    maxlength: 200,
    default: ''
  },

  // 가격 (코인)
  price: {
    type: Number,
    required: true,
    min: 0
  },

  // 아이템 카테고리
  category: {
    type: String,
    enum: ['top', 'bottom', 'accessory', 'background'],
    required: true
  },

  // 아이템 타입 (세부 분류)
  type: {
    type: String,
    enum: [
      // 의류
      'clothing', 'sport', 'formal', 'casual', 'special',
      // 액세서리
      'hat', 'glasses', 'scarf', 'bag', 'jewelry',
      // 배경
      'simple', 'nature', 'city', 'space', 'fantasy',
      // 기타
      'premium', 'limited', 'seasonal', 'event'
    ],
    required: true
  },

  // 이미지 정보
  imageUrl: {
    type: String,
    required: true
  },

  thumbnailUrl: {
    type: String,
    default: ''
  },

  previewImageUrl: {
    type: String,
    default: ''
  },

  // 색상 정보
  colors: [{
    name: String,        // 색상 이름 (예: 'blue', 'red')
    hex: String,         // HEX 코드 (예: '#3b82f6')
    imageUrl: String     // 색상별 이미지 URL
  }],

  // 아이템 속성
  rarity: {
    type: String,
    enum: ['common', 'rare', 'epic', 'legendary'],
    default: 'common'
  },

  tags: [{
    type: String,
    trim: true,
    maxlength: 20
  }],

  // 판매 상태
  isActive: {
    type: Boolean,
    default: true
  },

  isLimited: {
    type: Boolean,
    default: false
  },

  // 한정 아이템 정보
  limitedInfo: {
    startDate: Date,
    endDate: Date,
    maxQuantity: Number,
    soldQuantity: {
      type: Number,
      default: 0
    }
  },

  // 할인 정보
  discount: {
    isActive: {
      type: Boolean,
      default: false
    },
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    startDate: Date,
    endDate: Date
  },

  // 통계 정보
  stats: {
    totalPurchases: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5
    },
    ratingCount: {
      type: Number,
      default: 0
    }
  },

  // 정렬 순서
  sortOrder: {
    type: Number,
    default: 0
  },

  // 출시일
  releaseDate: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// 인덱스 설정
shopItemSchema.index({ category: 1, isActive: 1 });
shopItemSchema.index({ type: 1, isActive: 1 });
shopItemSchema.index({ price: 1 });
shopItemSchema.index({ rarity: 1 });
shopItemSchema.index({ 'stats.totalPurchases': -1 });
shopItemSchema.index({ releaseDate: -1 });
shopItemSchema.index({ sortOrder: 1 });

// 가상 필드
shopItemSchema.virtual('finalPrice').get(function() {
  if (this.discount.isActive && this.isDiscountValid()) {
    return Math.round(this.price * (1 - this.discount.percentage / 100));
  }
  return this.price;
});

shopItemSchema.virtual('discountAmount').get(function() {
  return this.price - this.finalPrice;
});

shopItemSchema.virtual('isOnSale').get(function() {
  return this.discount.isActive && this.isDiscountValid();
});

shopItemSchema.virtual('rarityColor').get(function() {
  const colors = {
    common: '#6b7280',
    rare: '#3b82f6', 
    epic: '#8b5cf6',
    legendary: '#f59e0b'
  };
  return colors[this.rarity] || colors.common;
});

shopItemSchema.virtual('isAvailable').get(function() {
  if (!this.isActive) return false;
  
  if (this.isLimited) {
    const now = new Date();
    if (this.limitedInfo.startDate && now < this.limitedInfo.startDate) return false;
    if (this.limitedInfo.endDate && now > this.limitedInfo.endDate) return false;
    if (this.limitedInfo.maxQuantity && this.limitedInfo.soldQuantity >= this.limitedInfo.maxQuantity) return false;
  }
  
  return true;
});

// 인스턴스 메서드: 할인 유효성 확인
shopItemSchema.methods.isDiscountValid = function() {
  if (!this.discount.isActive) return false;
  
  const now = new Date();
  if (this.discount.startDate && now < this.discount.startDate) return false;
  if (this.discount.endDate && now > this.discount.endDate) return false;
  
  return true;
};

// 인스턴스 메서드: 구매 처리
shopItemSchema.methods.processPurchase = function() {
  this.stats.totalPurchases += 1;
  this.stats.totalRevenue += this.finalPrice;
  
  if (this.isLimited) {
    this.limitedInfo.soldQuantity += 1;
  }
  
  return this.save();
};

// 인스턴스 메서드: 평점 업데이트
shopItemSchema.methods.updateRating = function(newRating) {
  const currentTotal = this.stats.averageRating * this.stats.ratingCount;
  this.stats.ratingCount += 1;
  this.stats.averageRating = (currentTotal + newRating) / this.stats.ratingCount;
  
  return this.save();
};

// 정적 메서드: 활성 아이템 조회
shopItemSchema.statics.getActiveItems = function(options = {}) {
  const {
    category = null,
    type = null,
    rarity = null,
    priceRange = null,
    sortBy = 'releaseDate',
    sortOrder = -1,
    limit = 50,
    skip = 0
  } = options;

  const query = { isActive: true };

  if (category) query.category = category;
  if (type) query.type = type;
  if (rarity) query.rarity = rarity;
  
  if (priceRange) {
    query.price = {};
    if (priceRange.min !== undefined) query.price.$gte = priceRange.min;
    if (priceRange.max !== undefined) query.price.$lte = priceRange.max;
  }

  const sortOptions = {};
  if (sortBy === 'popularity') {
    sortOptions['stats.totalPurchases'] = -1;
  } else if (sortBy === 'price') {
    sortOptions.price = sortOrder;
  } else if (sortBy === 'name') {
    sortOptions.name = sortOrder;
  } else {
    sortOptions[sortBy] = sortOrder;
  }

  return this.find(query)
    .sort(sortOptions)
    .limit(limit)
    .skip(skip);
};

// 정적 메서드: 인기 아이템 조회
shopItemSchema.statics.getPopularItems = function(limit = 10) {
  return this.find({ isActive: true })
    .sort({ 'stats.totalPurchases': -1, 'stats.averageRating': -1 })
    .limit(limit);
};

// 정적 메서드: 신상품 조회
shopItemSchema.statics.getNewItems = function(days = 7, limit = 10) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return this.find({
    isActive: true,
    releaseDate: { $gte: cutoffDate }
  })
  .sort({ releaseDate: -1 })
  .limit(limit);
};

// 정적 메서드: 할인 아이템 조회
shopItemSchema.statics.getSaleItems = function(limit = 20) {
  const now = new Date();
  
  return this.find({
    isActive: true,
    'discount.isActive': true,
    $or: [
      { 'discount.startDate': { $exists: false } },
      { 'discount.startDate': { $lte: now } }
    ],
    $or: [
      { 'discount.endDate': { $exists: false } },
      { 'discount.endDate': { $gte: now } }
    ]
  })
  .sort({ 'discount.percentage': -1, releaseDate: -1 })
  .limit(limit);
};

// 정적 메서드: 카테고리별 통계
shopItemSchema.statics.getCategoryStats = async function() {
  return await this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$category',
        totalItems: { $sum: 1 },
        avgPrice: { $avg: '$price' },
        totalSales: { $sum: '$stats.totalPurchases' },
        totalRevenue: { $sum: '$stats.totalRevenue' }
      }
    },
    { $sort: { totalRevenue: -1 } }
  ]);
};

const ShopItem = mongoose.model('ShopItem', shopItemSchema);

module.exports = ShopItem;
