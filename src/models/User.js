const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  // 기본 정보
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(email) {
        return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(email);
      },
      message: '유효하지 않은 이메일 형식입니다.'
    }
  },
  
  password: {
    type: String,
    required: function() {
      return !this.socialId; // 소셜 로그인이 아닌 경우에만 필수
    },
    minlength: 6,
    select: false // 기본적으로 조회 시 제외
  },

  // 소셜 로그인 정보
  socialId: {
    type: String,
    sparse: true // null 값도 허용하면서 유니크 제약 적용
  },
  
  socialProvider: {
    type: String,
    enum: ['google', 'apple', null],
    default: null
  },

  // 프로필 정보
  profileName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },

  profileImage: {
    type: String,
    default: null
  },

  // 사용자 유형 (온보딩에서 선택)
  userType: {
    type: String,
    enum: ['집중력개선', '루틴형성', '목표관리'], // PDF 명세에 따른 정확한 한글 표기
    required: true
  },

  // 구독 정보
  isPremium: {
    type: Boolean,
    default: false
  },

  premiumStartDate: {
    type: Date,
    default: null
  },

  premiumEndDate: {
    type: Date,
    default: null
  },

  // 코인 시스템
  coins: {
    type: Number,
    default: 0,
    min: 0
  },

  // 일일 보상 기록
  dailyRewards: [{
    type: {
      type: String,
      enum: ['task_completion', 'pomodoro_completion', 'reminder_completion', 'daily_login', 'special_event'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    date: {
      type: Date,
      required: true
    },
    description: {
      type: String,
      default: ''
    }
  }],

  // 통계 정보
  totalPomodoroSessions: {
    type: Number,
    default: 0
  },

  totalFocusTime: {
    type: Number,
    default: 0 // 분 단위
  },

  // 설정 정보
  timezone: {
    type: String,
    default: 'Asia/Seoul'
  },

  language: {
    type: String,
    default: 'ko',
    enum: ['ko', 'en']
  },

  // 알림 설정
  notificationSettings: {
    push: {
      type: Boolean,
      default: true
    },
    email: {
      type: Boolean,
      default: false
    },
    reminder: {
      type: Boolean,
      default: true
    },
    pomodoro: {
      type: Boolean,
      default: true
    }
  },

  // 계정 상태
  isActive: {
    type: Boolean,
    default: true
  },

  isEmailVerified: {
    type: Boolean,
    default: false
  },

  emailVerificationToken: {
    type: String,
    select: false
  },

  passwordResetToken: {
    type: String,
    select: false
  },

  passwordResetExpires: {
    type: Date,
    select: false
  },

  // 마지막 활동
  lastLoginAt: {
    type: Date,
    default: null
  },

  lastActiveAt: {
    type: Date,
    default: Date.now
  },

  // 디바이스 정보
  deviceTokens: [{
    token: String,
    platform: {
      type: String,
      enum: ['ios', 'android', 'web']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]

}, {
  timestamps: true, // createdAt, updatedAt 자동 생성
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.emailVerificationToken;
      delete ret.passwordResetToken;
      delete ret.passwordResetExpires;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// 인덱스 설정 (email은 unique: true로 이미 인덱스가 있으므로 중복 제거)
userSchema.index({ socialId: 1, socialProvider: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActiveAt: -1 });

// 가상 필드
userSchema.virtual('isPremiumActive').get(function() {
  return this.subscriptionStatus === 'premium' && 
         this.subscriptionEndDate && 
         this.subscriptionEndDate > new Date();
});

userSchema.virtual('subscriptionInfo').get(function() {
  return {
    status: this.subscriptionStatus,
    plan: this.subscriptionPlan,
    expiryDate: this.subscriptionEndDate,
    isActive: this.isPremiumActive
  };
});

// 비밀번호 해싱 미들웨어
userSchema.pre('save', async function(next) {
  // 비밀번호가 변경되지 않았으면 스킵
  if (!this.isModified('password')) return next();
  
  try {
    // 비밀번호 해싱
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

// 비밀번호 검증 메서드
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// 프리미엄 만료 확인 메서드
userSchema.methods.checkPremiumStatus = function() {
  if (this.subscriptionStatus !== 'premium') return false;
  if (!this.subscriptionEndDate) return false;
  
  if (this.subscriptionEndDate <= new Date()) {
    this.subscriptionStatus = 'free';
    this.subscriptionPlan = null;
    this.save();
    return false;
  }
  
  return true;
};

// 구독 활성화 메서드
userSchema.methods.activatePremium = function(plan, duration) {
  this.subscriptionStatus = 'premium';
  this.subscriptionPlan = plan;
  this.subscriptionStartDate = new Date();
  
  const endDate = new Date();
  if (plan === 'premium_monthly') {
    endDate.setMonth(endDate.getMonth() + 1);
  } else if (plan === 'premium_yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  }
  this.subscriptionEndDate = endDate;
  
  return this.save();
};

// 코인 추가 메서드
userSchema.methods.addCoins = function(amount, description = '') {
  this.coins += amount;
  return this.save();
};

// 코인 차감 메서드
userSchema.methods.deductCoins = function(amount, description = '') {
  if (this.coins < amount) {
    throw new Error('코인이 부족합니다.');
  }
  this.coins -= amount;
  return this.save();
};

// 마지막 활동 시간 업데이트
userSchema.methods.updateLastActive = function() {
  this.lastActiveAt = new Date();
  return this.save();
};

// 정적 메서드: 테스트 계정 생성
userSchema.statics.createTestAccount = async function() {
  const testEmail = process.env.TEST_USER_EMAIL || 'example@example.com';
  const testPassword = process.env.TEST_USER_PASSWORD || 'testpassword';
  
  // 기존 테스트 계정 확인
  const existingUser = await this.findOne({ email: testEmail });
  if (existingUser) {
    return existingUser;
  }
  
  // 새 테스트 계정 생성
  const testUser = new this({
    email: testEmail,
    password: testPassword,
    profileName: '테스트 사용자',
    userType: '집중력개선',
    subscriptionStatus: 'premium',
    subscriptionPlan: 'premium_yearly',
    subscriptionStartDate: new Date(),
    subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1년
    coins: 100,
    isEmailVerified: true
  });
  
  return await testUser.save();
};

const User = mongoose.model('User', userSchema);

module.exports = User;
