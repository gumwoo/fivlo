const mongoose = require('mongoose');
require('dotenv').config();

// User 모델 스키마 (간단 버전)
const userSchema = new mongoose.Schema({
  email: String,
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'expired'],
      default: 'active'
    },
    startDate: Date,
    endDate: Date
  }
}, { strict: false });

const User = mongoose.model('User', userSchema);

async function upgradeToPremium() {
  try {
    // MongoDB 연결
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fivlo_db');
    console.log('MongoDB 연결 성공');

    // 테스트 사용자 찾기 (test@example.com)
    const user = await User.findOne({ email: 'test@example.com' });
    
    if (!user) {
      console.log('사용자를 찾을 수 없습니다: test@example.com');
      return;
    }

    console.log('현재 사용자 정보:', {
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
      subscriptionPlan: user.subscriptionPlan
    });

    // Premium으로 업그레이드
    const endDate = new Date();
    endDate.setFullYear(endDate.getFullYear() + 1); // 1년 구독

    await User.findByIdAndUpdate(user._id, {
      subscriptionStatus: 'premium',
      subscriptionPlan: 'premium_yearly',
      subscriptionStartDate: new Date(),
      subscriptionEndDate: endDate
    });

    console.log('✅ Premium 업그레이드 완료!');
    console.log('구독 종료일:', endDate.toISOString().split('T')[0]);

    // 업데이트된 사용자 정보 확인
    const updatedUser = await User.findById(user._id);
    console.log('업데이트된 사용자 정보:', {
      email: updatedUser.email,
      subscriptionStatus: updatedUser.subscriptionStatus,
      subscriptionPlan: updatedUser.subscriptionPlan,
      subscriptionEndDate: updatedUser.subscriptionEndDate
    });

  } catch (error) {
    console.error('에러 발생:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB 연결 종료');
  }
}

upgradeToPremium();
