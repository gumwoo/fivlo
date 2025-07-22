const axios = require('axios');
const logger = require('./src/utils/logger');

const BASE_URL = 'http://localhost:5000/api';

/**
 * 커스터마이징 시스템 테스트
 */
class CustomizationTester {
  constructor() {
    this.token = null;
    this.userId = null;
  }

  // 사용자 로그인
  async login() {
    try {
      console.log('🔐 사용자 로그인 시도...');
      
      // 테스트 사용자 생성 (이미 존재하면 스킵)
      try {
        await axios.post(`${BASE_URL}/auth/register`, {
          email: 'test@fivlo.com',
          password: 'testpassword123',
          profileName: '테스트 사용자',
          userType: 'focus',
          isPremium: true // 유료 사용자로 설정
        });
        console.log('✅ 테스트 사용자 생성 완료');
      } catch (error) {
        if (error.response?.status === 400) {
          console.log('ℹ️  테스트 사용자가 이미 존재합니다');
        } else {
          console.log('⚠️  사용자 생성 실패:', error.response?.data);
        }
      }

      // 로그인
      const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
        email: 'test@fivlo.com',
        password: 'testpassword123'
      });

      this.token = loginResponse.data.data.token;
      this.userId = loginResponse.data.data.user._id;
      
      console.log('✅ 로그인 성공');
      console.log(`사용자 ID: ${this.userId}`);
      console.log(`코인: ${loginResponse.data.data.user.coins}개`);
      
    } catch (error) {
      console.error('❌ 로그인 실패:', error.response?.data || error.message);
      throw error;
    }
  }

  // API 요청 헬퍼
  async apiRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
      
    } catch (error) {
      console.error(`❌ API 요청 실패 ${method} ${endpoint}:`, error.response?.data || error.message);
      throw error;
    }
  }

  // 상점 아이템 조회 테스트
  async testShopItems() {
    console.log('\n🛍️  상점 아이템 조회 테스트...');
    
    const result = await this.apiRequest('GET', '/customization/shop?limit=5');
    
    console.log(`✅ 상점 아이템 ${result.data.items.length}개 조회 완료`);
    console.log('아이템 목록:');
    
    result.data.items.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.name} (${item.category}) - ${item.price}코인 ${item.isOwned ? '[보유중]' : ''}`);
    });
    
    return result.data.items;
  }

  // 사용자 코인 조회 테스트
  async testUserCoins() {
    console.log('\n💰 사용자 코인 조회 테스트...');
    
    const result = await this.apiRequest('GET', '/customization/coins');
    
    console.log(`✅ 현재 코인: ${result.data.coins}개`);
    return result.data.coins;
  }

  // 인벤토리 조회 테스트
  async testInventory() {
    console.log('\n🎒 인벤토리 조회 테스트...');
    
    const result = await this.apiRequest('GET', '/customization/inventory');
    
    console.log(`✅ 보유 아이템: ${result.data.stats.totalItems}개`);
    console.log(`착용 중인 아이템: ${result.data.stats.equippedCount}개`);
    console.log(`총 소비 코인: ${result.data.stats.totalSpent}개`);
    
    if (result.data.inventory.items.length > 0) {
      console.log('보유 아이템 목록:');
      result.data.inventory.items.forEach((item, index) => {
        console.log(`  ${index + 1}. ${item.itemId.name} - ${item.purchasePrice}코인으로 구매`);
      });
    }
    
    return result.data;
  }

  // 아이템 구매 테스트
  async testPurchaseItem(items) {
    console.log('\n💳 아이템 구매 테스트...');
    
    // 보유하지 않은 저렴한 아이템 찾기
    const availableItem = items.find(item => !item.isOwned && item.price <= 50);
    
    if (!availableItem) {
      console.log('⚠️  구매 가능한 아이템이 없습니다');
      return;
    }
    
    console.log(`구매할 아이템: ${availableItem.name} (${availableItem.price}코인)`);
    
    const result = await this.apiRequest('POST', '/customization/purchase', {
      itemId: availableItem._id
    });
    
    console.log(`✅ 아이템 구매 완료! 잔여 코인: ${result.data.remainingCoins}개`);
    return availableItem;
  }

  // 아이템 착용 테스트
  async testEquipItem(purchasedItem) {
    if (!purchasedItem) return;
    
    console.log('\n👕 아이템 착용 테스트...');
    
    const result = await this.apiRequest('POST', '/customization/equip', {
      itemId: purchasedItem._id
    });
    
    console.log(`✅ ${purchasedItem.name} 착용 완료!`);
    console.log('현재 착용 중인 아이템:', result.data.equippedItems);
    
    return result.data.equippedItems;
  }

  // 오분이 모습 조회 테스트
  async testAppearance() {
    console.log('\n🐻 오분이 모습 조회 테스트...');
    
    const result = await this.apiRequest('GET', '/customization/appearance');
    
    console.log(`✅ 오분이 모습 조회 완료 ${result.data.isDefault ? '(기본 모습)' : '(커스터마이징 적용)'}`);
    console.log('현재 모습:', result.data.appearance);
    
    return result.data;
  }

  // 전체 테스트 실행
  async runAllTests() {
    try {
      console.log('🚀 FIVLO 커스터마이징 시스템 테스트 시작\n');

      // 1. 로그인
      await this.login();

      // 2. 코인 조회
      await this.testUserCoins();

      // 3. 상점 아이템 조회
      const items = await this.testShopItems();

      // 4. 인벤토리 조회
      await this.testInventory();

      // 5. 아이템 구매
      const purchasedItem = await this.testPurchaseItem(items);

      // 6. 아이템 착용
      await this.testEquipItem(purchasedItem);

      // 7. 오분이 모습 조회
      await this.testAppearance();

      // 8. 최종 인벤토리 확인
      console.log('\n📊 최종 상태 확인...');
      await this.testInventory();
      await this.testUserCoins();

      console.log('\n🎉 모든 테스트 완료!');

    } catch (error) {
      console.error('\n💥 테스트 실패:', error.message);
    }
  }
}

// 테스트 실행
if (require.main === module) {
  const tester = new CustomizationTester();
  tester.runAllTests();
}

module.exports = CustomizationTester;
