const axios = require('axios');

async function testAI() {
  try {
    console.log('🤖 FIVLO AI 시스템 테스트 시작\n');

    // 1. 로그인
    console.log('🔐 로그인 중...');
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'test@fivlo.com',
      password: 'testpassword123'
    });
    
    const token = loginRes.data.data.token;
    const headers = { 'Authorization': `Bearer ${token}` };
    
    console.log('✅ 로그인 성공!');

    // 2. AI 서비스 상태 확인
    console.log('\n🔍 AI 서비스 상태 확인...');
    const healthRes = await axios.get('http://localhost:5000/api/ai/health', { headers });
    console.log(`✅ AI 서비스 상태: ${healthRes.data.data.status}`);
    console.log(`OpenAI 연결: ${healthRes.data.data.services.openai}`);

    // 3. AI 목표 생성
    console.log('\n🎯 AI 목표 생성 중...');
    const goalData = {
      goal: '영어 회화 실력 향상하기',
      duration: '3개월',
      currentSituation: '기초 수준의 영어 실력',
      availableTime: '하루 1시간',
      experienceLevel: '초보'
    };
    
    const aiGoalRes = await axios.post('http://localhost:5000/api/ai/goals', goalData, { headers });
    const aiGoal = aiGoalRes.data.data;
    
    console.log(`✅ AI 목표 생성 완료: ${aiGoal._id}`);
    console.log(`분석: ${aiGoal.aiAnalysis.analysis.substring(0, 100)}...`);
    console.log(`추천 기간: ${aiGoal.aiAnalysis.timeline}`);
    console.log(`난이도: ${aiGoal.aiAnalysis.difficulty}`);
    console.log(`생성된 태스크: ${aiGoal.generatedTasks.length}개`);
    
    // 태스크 목록 출력
    console.log('\n📋 생성된 태스크들:');
    aiGoal.generatedTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.title} (${task.priority}, ${task.estimatedTime})`);
    });

    // 4. 동기부여 메시지 생성
    console.log('\n💪 동기부여 메시지 생성 중...');
    const motivationRes = await axios.post('http://localhost:5000/api/ai/motivation', {
      context: '새로운 목표를 시작하려고 해요'
    }, { headers });
    
    console.log(`✅ 동기부여 메시지: ${motivationRes.data.data.message}`);

    // 5. 일일 스케줄 생성
    console.log('\n📅 일일 스케줄 생성 중...');
    const scheduleRes = await axios.post('http://localhost:5000/api/ai/schedule', {
      availableHours: 6,
      preferredTime: '오전',
      focusType: '일반'
    }, { headers });
    
    console.log(`✅ 일일 스케줄 생성 완료: ${scheduleRes.data.data.schedule.pomodoroSessions}개 포모도로 세션`);
    console.log(`총 집중 시간: ${scheduleRes.data.data.schedule.totalFocusTime}분`);

    // 6. 루틴 추천
    console.log('\n🔄 루틴 추천 중...');
    const routineRes = await axios.post('http://localhost:5000/api/ai/routine', {
      category: '학습',
      preferences: {
        purpose: '영어 실력 향상',
        timeLimit: '30분',
        level: '초보'
      }
    }, { headers });
    
    console.log(`✅ 루틴 추천: ${routineRes.data.data.routineName}`);
    console.log(`설명: ${routineRes.data.data.description}`);

    // 7. AI 목표 목록 조회
    console.log('\n📊 AI 목표 목록 조회...');
    const goalsRes = await axios.get('http://localhost:5000/api/ai/goals', { headers });
    console.log(`✅ 총 AI 목표: ${goalsRes.data.data.goals.length}개`);

    // 8. AI 통계 조회
    console.log('\n📈 AI 통계 조회...');
    const statsRes = await axios.get('http://localhost:5000/api/ai/stats', { headers });
    const stats = statsRes.data.data.stats;
    console.log(`✅ AI 통계:`);
    console.log(`  - 총 목표: ${stats.totalGoals}개`);
    console.log(`  - 완료된 목표: ${stats.completedGoals}개`);
    console.log(`  - 총 태스크: ${stats.totalTasks}개`);

    // 9. AI 태스크를 실제 Task로 변환 (첫 3개만)
    console.log('\n🔄 AI 태스크를 실제 Task로 변환 중...');
    const convertRes = await axios.post(`http://localhost:5000/api/ai/goals/${aiGoal._id}/convert`, {
      selectedTasks: [0, 1, 2] // 첫 3개 태스크만 변환
    }, { headers });
    
    console.log(`✅ ${convertRes.data.data.totalTasks}개 태스크가 실제 Task로 변환되었습니다`);

    // 10. 진행 상황 분석
    console.log('\n📊 진행 상황 분석...');
    const analysisRes = await axios.get(`http://localhost:5000/api/ai/goals/${aiGoal._id}/analysis`, { headers });
    console.log(`✅ 진행률: ${analysisRes.data.data.analysis.progressPercentage}%`);

    console.log('\n🎉 모든 AI 기능 테스트 완료!');
    console.log('\n🌟 AI 기능들:');
    console.log('  ✅ 목표 세분화 - OpenAI GPT-4로 목표를 실행 가능한 태스크로 분해');
    console.log('  ✅ 일일 스케줄 - 포모도로 기법 기반 맞춤 스케줄 생성');
    console.log('  ✅ 동기부여 메시지 - 상황별 격려 메시지 생성');
    console.log('  ✅ 루틴 추천 - 카테고리별 최적 루틴 제안');
    console.log('  ✅ 진행 분석 - AI 기반 성과 분석 및 개선 제안');
    console.log('  ✅ Task 연동 - AI 생성 태스크를 FIVLO Task로 자동 변환');

  } catch (error) {
    console.error('❌ AI 테스트 실패:', error.response?.data || error.message);
    
    if (error.response?.status === 500 && error.response?.data?.message?.includes('AI 서비스')) {
      console.log('\n💡 참고: OpenAI API 키가 올바르게 설정되었는지 확인해주세요.');
    }
  }
}

testAI();
