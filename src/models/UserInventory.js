const mongoose = require('mongoose');

/**
 * 사용자 보유 아이템 스키마
 * 유저가 구매한 오분이 커스터마이징 아이템들을 관리
 */
const userInventorySchema = new mongoose.Schema({
  // 사용자 ID
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // 보유 아이템 목록
  items: [{
    // 상점 아이템 ID 참조
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShopItem',
      required: true
    },
    
    // 구매 일시
    purchasedAt: {
      type: Date,
      default: Date.now
    },
    
    // 구매 가격 (당시 가격 기록)
    purchasePrice: {
      type: Number,
      required: true,
      min: 0
    },
    
    // 구매 거래 ID 참조
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CoinTransaction',
      required: true
    }
  }],
  
  // 현재 착용 중인 아이템들
  equippedItems: {
    // 상의
    top: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShopItem',
      default: null
    },
    
    // 하의
    bottom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShopItem',
      default: null
    },
    
    // 액세서리
    accessory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShopItem',
      default: null
    },
    
    // 배경
    background: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ShopItem',
      default: null
    }
  }
}, {
  timestamps: true,
  collection: 'user_inventories'
});

// 복합 인덱스 생성
userInventorySchema.index({ userId: 1, 'items.itemId': 1 });
userInventorySchema.index({ userId: 1, 'equippedItems.top': 1 });
userInventorySchema.index({ userId: 1, 'equippedItems.bottom': 1 });
userInventorySchema.index({ userId: 1, 'equippedItems.accessory': 1 });
userInventorySchema.index({ userId: 1, 'equippedItems.background': 1 });

/**
 * 특정 아이템을 보유하고 있는지 확인
 */
userInventorySchema.methods.hasItem = function(itemId) {
  return this.items.some(item => item.itemId.toString() === itemId.toString());
};

/**
 * 아이템 구매 추가
 */
userInventorySchema.methods.addItem = function(itemId, purchasePrice, transactionId) {
  // 이미 보유 중인지 확인
  if (this.hasItem(itemId)) {
    throw new Error('이미 보유하고 있는 아이템입니다');
  }
  
  this.items.push({
    itemId,
    purchasePrice,
    transactionId,
    purchasedAt: new Date()
  });
  
  return this.save();
};

/**
 * 아이템 착용
 */
userInventorySchema.methods.equipItem = async function(itemId) {
  // 아이템 보유 여부 확인
  if (!this.hasItem(itemId)) {
    throw new Error('보유하지 않은 아이템입니다');
  }
  
  // 아이템 정보 조회
  const ShopItem = mongoose.model('ShopItem');
  const item = await ShopItem.findById(itemId);
  
  if (!item) {
    throw new Error('존재하지 않는 아이템입니다');
  }
  
  // 카테고리에 따라 착용
  switch (item.category) {
    case 'top':
      this.equippedItems.top = itemId;
      break;
    case 'bottom':
      this.equippedItems.bottom = itemId;
      break;
    case 'accessory':
      this.equippedItems.accessory = itemId;
      break;
    case 'background':
      this.equippedItems.background = itemId;
      break;
    default:
      throw new Error('알 수 없는 아이템 카테고리입니다');
  }
  
  return this.save();
};

/**
 * 아이템 착용 해제
 */
userInventorySchema.methods.unequipItem = function(category) {
  const validCategories = ['top', 'bottom', 'accessory', 'background'];
  
  if (!validCategories.includes(category)) {
    throw new Error('유효하지 않은 카테고리입니다');
  }
  
  this.equippedItems[category] = null;
  return this.save();
};

/**
 * 착용 중인 아이템 조회
 */
userInventorySchema.methods.getEquippedItems = function() {
  return {
    top: this.equippedItems.top,
    bottom: this.equippedItems.bottom,
    accessory: this.equippedItems.accessory,
    background: this.equippedItems.background
  };
};

/**
 * 보유 아이템 통계
 */
userInventorySchema.methods.getItemStats = function() {
  const totalItems = this.items.length;
  const totalSpent = this.items.reduce((sum, item) => sum + item.purchasePrice, 0);
  const equippedCount = Object.values(this.equippedItems).filter(item => item !== null).length;
  
  return {
    totalItems,
    totalSpent,
    equippedCount,
    unequippedCount: totalItems - equippedCount
  };
};

/**
 * 사용자별 인벤토리 생성 또는 조회
 */
userInventorySchema.statics.findOrCreateByUserId = async function(userId) {
  let inventory = await this.findOne({ userId });
  
  if (!inventory) {
    inventory = new this({
      userId,
      items: [],
      equippedItems: {
        top: null,
        bottom: null,
        accessory: null,
        background: null
      }
    });
    await inventory.save();
  }
  
  return inventory;
};

/**
 * 아이템 구매 처리 (트랜잭션과 함께)
 */
userInventorySchema.statics.purchaseItem = async function(userId, itemId, session = null) {
  const User = mongoose.model('User');
  const ShopItem = mongoose.model('ShopItem');
  const CoinTransaction = mongoose.model('CoinTransaction');
  
  // 트랜잭션 시작
  const transactionSession = session || await mongoose.startSession();
  if (!session) transactionSession.startTransaction();
  
  try {
    // 사용자 조회
    const user = await User.findById(userId).session(transactionSession);
    if (!user) {
      throw new Error('사용자를 찾을 수 없습니다');
    }
    
    // 아이템 조회
    const item = await ShopItem.findById(itemId).session(transactionSession);
    if (!item) {
      throw new Error('아이템을 찾을 수 없습니다');
    }
    
    // 코인 부족 확인
    if (user.coins < item.price) {
      throw new Error('코인이 부족합니다');
    }
    
    // 인벤토리 조회/생성
    const inventory = await this.findOrCreateByUserId(userId);
    
    // 이미 보유 확인
    if (inventory.hasItem(itemId)) {
      throw new Error('이미 보유하고 있는 아이템입니다');
    }
    
    // 코인 차감
    user.coins -= item.price;
    await user.save({ session: transactionSession });
    
    // 코인 거래 기록
    const transaction = new CoinTransaction({
      userId,
      type: 'spend',
      amount: item.price,
      description: `아이템 구매: ${item.name}`,
      relatedModel: 'ShopItem',
      relatedId: itemId
    });
    await transaction.save({ session: transactionSession });
    
    // 인벤토리에 아이템 추가
    await inventory.addItem(itemId, item.price, transaction._id);
    
    if (!session) await transactionSession.commitTransaction();
    
    return {
      inventory,
      transaction,
      remainingCoins: user.coins
    };
    
  } catch (error) {
    if (!session) await transactionSession.abortTransaction();
    throw error;
  } finally {
    if (!session) transactionSession.endSession();
  }
};

module.exports = mongoose.model('UserInventory', userInventorySchema);
