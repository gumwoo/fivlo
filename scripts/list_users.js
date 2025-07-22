const mongoose = require('mongoose');
require('dotenv').config();

// User 모델 스키마 (간단 버전)
const userSchema = new mongoose.Schema({}, { strict: false });
const User = mongoose.model('User', userSchema);

async function listAllUsers() {
  try {
    // MongoDB 연결
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fivlo_db');
    console.log('MongoDB 연결 성공');

    // 모든 사용자 조회
    const users = await User.find({}).select('email subscription _id createdAt');
    
    console.log(`총 ${users.length}명의 사용자 발견:`);
    users.forEach((user, index) => {
      console.log(`${index + 1}. ID: ${user._id}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   구독: ${user.subscription?.plan || 'free'} (${user.subscription?.status || 'active'})`);
      console.log(`   생성일: ${user.createdAt || 'N/A'}`);
      console.log('');
    });

  } catch (error) {
    console.error('에러 발생:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB 연결 종료');
  }
}

listAllUsers();
