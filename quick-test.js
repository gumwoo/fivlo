// 간단한 커스터마이징 API 테스트
const axios = require('axios');

async function quickTest() {
  try {
    // 1. 로그인
    console.log('🔐 로그인 중...');
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'test@fivlo.com',
      password: 'testpassword123'
    });
    
    const token = loginRes.data.data.token;
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('✅ 로그인 성공!');
    console.log(`사용자 코인: ${loginRes.data.data.user.coins}개`);
    
    // 2. 상점 아이템 조회
    console.log('\n🛍️ 상점 아이템 조회 중...');
    const shopRes = await axios.get('http://localhost:5000/api/customization/shop?limit=3', { headers });
    
    console.log(`✅ 상점 아이템 ${shopRes.data.data.items.length}개 조회 완료`);
    shopRes.data.data.items.forEach((item, i) => {
      console.log(`  ${i+1}. ${item.name} (${item.category}) - ${item.price}코인`);
    });
    
    // 3. 인벤토리 조회
    console.log('\n🎒 인벤토리 조회 중...');
    const invRes = await axios.get('http://localhost:5000/api/customization/inventory', { headers });
    
    console.log(`✅ 보유 아이템: ${invRes.data.data.stats.totalItems}개`);
    console.log(`착용 아이템: ${invRes.data.data.stats.equippedCount}개`);
    
    // 4. 오분이 모습 조회
    console.log('\n🐻 오분이 모습 조회 중...');
    const appearanceRes = await axios.get('http://localhost:5000/api/customization/appearance', { headers });
    
    console.log(`✅ 오분이 모습: ${appearanceRes.data.data.isDefault ? '기본 모습' : '커스터마이징 적용'}`);
    
    console.log('\n🎉 모든 테스트 성공!');
    
  } catch (error) {
    console.error('❌ 테스트 실패:', error.response?.data || error.message);
  }
}

quickTest();
