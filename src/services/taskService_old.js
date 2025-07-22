const Task = require('../models/Task');
const Category = require('../models/Category');
const GrowthAlbum = require('../models/GrowthAlbum');
const logger = require('../utils/logger');

class TaskService {
  /**
   * 사용자 초기화 (기본 카테고리 생성)
   */
  async initializeUser(userId) {
    try {
      const defaultCategory = await Category.createDefaultCategory(userId);
      
      logger.info('사용자 Task 시스템 초기화 완료', {
        userId,
        defaultCategoryId: defaultCategory._id
      });

      return defaultCategory;
    } catch (error) {
      logger.error(`사용자 초기화 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * Task 생성
   */
  async createTask(userId, taskData) {
    try {
      const {
        title,
        description = '',
        categoryId,
        date,
        time = null,
        priority = 'medium',
        isRepeating = false,
        repeatType = null,
        repeatDays = [],
        repeatEndDate = null,
        hasGrowthAlbum = false,
        tags = [],
        estimatedMinutes = null
      } = taskData;

      // 카테고리 확인
      const category = await Category.findOne({ _id: categoryId, userId });
      if (!category) {
        throw new Error('유효하지 않은 카테고리입니다.');
      }

      // 새 Task 생성
      const task = new Task({
        userId,
        categoryId,
        title: title.trim(),
        description: description.trim(),
        date: new Date(date),
        time,
        priority,
        isRepeating,
        repeatType: isRepeating ? repeatType : null,
        repeatDays: isRepeating ? repeatDays : [],
        repeatEndDate: isRepeating && repeatEndDate ? new Date(repeatEndDate) : null,
        hasGrowthAlbum,
        tags,
        estimatedMinutes,
        color: category.color
      });

      await task.save();

      // 반복 Task 생성
      if (isRepeating && repeatEndDate) {
        await task.createRepeatingTasks();
      }

      // 카테고리 통계 업데이트
      await category.updateStats();

      logger.info('Task 생성 완료', {
        userId,
        taskId: task._id,
        title: task.title,
        isRepeating
      });

      return task;
    } catch (error) {
      logger.error(`Task 생성 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * Task 완료 처리
   */
  async completeTask(userId, taskId, completionData = {}) {
    try {
      const { actualMinutes = null, growthAlbumData = null } = completionData;

      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        throw new Error('Task를 찾을 수 없습니다.');
      }

      if (task.isCompleted) {
        throw new Error('이미 완료된 Task입니다.');
      }

      // Task 완료 처리
      await task.complete(actualMinutes);

      let growthAlbum = null;

      // 성장앨범 생성 (hasGrowthAlbum이 true이고 이미지 데이터가 제공된 경우)
      if (task.hasGrowthAlbum && growthAlbumData) {
        growthAlbum = new GrowthAlbum({
          userId,
          taskId: task._id,
          imageUrl: growthAlbumData.imageUrl,
          imagePath: growthAlbumData.imagePath,
          imageSize: growthAlbumData.imageSize,
          imageType: growthAlbumData.imageType,
          thumbnailUrl: growthAlbumData.thumbnailUrl,
          thumbnailPath: growthAlbumData.thumbnailPath,
          memo: growthAlbumData.memo || '',
          tags: growthAlbumData.tags || [],
          mood: growthAlbumData.mood || null,
          rating: growthAlbumData.rating || null
        });

        await growthAlbum.save();
      }

      logger.info('Task 완료 처리', {
        userId,
        taskId: task._id,
        hasGrowthAlbum: !!growthAlbum,
        actualMinutes
      });

      return {
        task,
        growthAlbum
      };
    } catch (error) {
      logger.error(`Task 완료 실패: ${error.message}`, { userId, taskId });
      throw error;
    }
  }

  /**
   * 날짜별 Task 조회
   */
  async getTasksByDate(userId, date) {
    try {
      const tasks = await Task.getTasksByDate(userId, date);
      
      logger.debug('날짜별 Task 조회', {
        userId,
        date: date.toISOString().split('T')[0],
        taskCount: tasks.length
      });

      return tasks;
    } catch (error) {
      logger.error(`날짜별 Task 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 월별 Task 조회 (캘린더용)
   */
  async getMonthlyTasks(userId, year, month) {
    try {
      const tasks = await Task.getMonthlyTasks(userId, year, month);
      
      // 날짜별로 그룹핑
      const tasksByDate = {};
      tasks.forEach(task => {
        const dateKey = task.formattedDate;
        if (!tasksByDate[dateKey]) {
          tasksByDate[dateKey] = [];
        }
        tasksByDate[dateKey].push(task);
      });

      logger.debug('월별 Task 조회', {
        userId,
        year,
        month,
        totalTasks: tasks.length,
        activeDays: Object.keys(tasksByDate).length
      });

      return {
        tasks: tasksByDate,
        summary: {
          totalTasks: tasks.length,
          completedTasks: tasks.filter(t => t.isCompleted).length,
          activeDays: Object.keys(tasksByDate).length
        }
      };
    } catch (error) {
      logger.error(`월별 Task 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 카테고리 생성
   */
  async createCategory(userId, categoryData) {
    try {
      const { name, color, icon = null } = categoryData;

      // 카테고리명 중복 확인
      const existingCategory = await Category.findOne({ 
        userId, 
        name: name.trim(),
        isActive: true 
      });

      if (existingCategory) {
        throw new Error('이미 존재하는 카테고리명입니다.');
      }

      // 다음 순서 계산
      const lastCategory = await Category.findOne({ userId })
        .sort({ order: -1 });
      const nextOrder = (lastCategory?.order || 0) + 1;

      const category = new Category({
        userId,
        name: name.trim(),
        color,
        icon,
        order: nextOrder
      });

      await category.save();

      logger.info('카테고리 생성 완료', {
        userId,
        categoryId: category._id,
        name: category.name
      });

      return category;
    } catch (error) {
      logger.error(`카테고리 생성 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 사용자 카테고리 목록 조회
   */
  async getUserCategories(userId) {
    try {
      const categories = await Category.getUserCategories(userId);
      
      logger.debug('사용자 카테고리 조회', {
        userId,
        categoryCount: categories.length
      });

      return categories;
    } catch (error) {
      logger.error(`카테고리 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * Task 업데이트
   */
  async updateTask(userId, taskId, updateData) {
    try {
      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        throw new Error('Task를 찾을 수 없습니다.');
      }

      // 카테고리 변경 시 색상도 업데이트
      if (updateData.categoryId && updateData.categoryId !== task.categoryId.toString()) {
        const newCategory = await Category.findOne({ 
          _id: updateData.categoryId, 
          userId 
        });
        
        if (!newCategory) {
          throw new Error('유효하지 않은 카테고리입니다.');
        }

        updateData.color = newCategory.color;
      }

      // 업데이트 적용
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          task[key] = updateData[key];
        }
      });

      await task.save();

      logger.info('Task 업데이트 완료', {
        userId,
        taskId: task._id,
        updatedFields: Object.keys(updateData)
      });

      return task;
    } catch (error) {
      logger.error(`Task 업데이트 실패: ${error.message}`, { userId, taskId });
      throw error;
    }
  }

  /**
   * Task 삭제
   */
  async deleteTask(userId, taskId) {
    try {
      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        throw new Error('Task를 찾을 수 없습니다.');
      }

      // 성장앨범이 있는 경우 함께 삭제
      if (task.hasGrowthAlbum) {
        const growthAlbums = await GrowthAlbum.find({ taskId: task._id });
        for (const album of growthAlbums) {
          await album.deleteOne();
        }
      }

      await task.deleteOne();

      logger.info('Task 삭제 완료', {
        userId,
        taskId: task._id,
        title: task.title
      });

      return { success: true };
    } catch (error) {
      logger.error(`Task 삭제 실패: ${error.message}`, { userId, taskId });
      throw error;
    }
  }

  /**
   * 성장앨범 조회
   */
  async getGrowthAlbum(userId, options = {}) {
    try {
      const { 
        view = 'calendar', // 'calendar' or 'category'
        categoryId = null,
        year = null,
        month = null
      } = options;

      let result;

      if (view === 'calendar' && year && month) {
        result = await GrowthAlbum.getMonthlyAlbum(userId, year, month);
      } else if (view === 'category') {
        result = await GrowthAlbum.getAlbumByCategory(userId, categoryId);
      } else {
        // 최근 앨범들
        result = await GrowthAlbum.find({ userId })
          .populate('taskId', 'title categoryId')
          .populate({
            path: 'taskId',
            populate: {
              path: 'categoryId',
              select: 'name color'
            }
          })
          .sort({ capturedAt: -1 })
          .limit(50);
      }

      logger.debug('성장앨범 조회', {
        userId,
        view,
        resultCount: Array.isArray(result) ? result.length : 1
      });

      return result;
    } catch (error) {
      logger.error(`성장앨범 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * 성장앨범 생성
   */
  async createGrowthAlbum(userId, taskId, albumData) {
    try {
      // Task 존재 확인
      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        throw new Error('Task를 찾을 수 없습니다.');
      }

      // 성장앨범 생성
      const growthAlbum = new GrowthAlbum({
        userId,
        taskId,
        imageUrl: albumData.imageUrl,
        thumbnailUrl: albumData.thumbnailUrl,
        imagePath: albumData.imagePath || albumData.imageUrl,
        thumbnailPath: albumData.thumbnailPath || albumData.thumbnailUrl,
        memo: albumData.memo || '',
        imageSize: albumData.imageSize || 0,
        imageType: albumData.imageType || 'image/jpeg'
      });

      await growthAlbum.save();

      // Task의 hasGrowthAlbum 플래그 업데이트
      if (!task.hasGrowthAlbum) {
        task.hasGrowthAlbum = true;
        await task.save();
      }

      logger.info('성장앨범 생성 완료', {
        userId,
        taskId,
        albumId: growthAlbum._id,
        imageUrl: growthAlbum.imageUrl
      });

      return growthAlbum;
    } catch (error) {
      logger.error(`성장앨범 생성 실패: ${error.message}`, { userId, taskId });
      throw error;
    }
  }

  /**
   * 성장앨범 월별 조회
   */
  async getGrowthAlbumsByMonth(userId, year, month) {
    try {
      return await GrowthAlbum.getMonthlyAlbum(userId, year, month);
    } catch (error) {
      logger.error(`월별 성장앨범 조회 실패: ${error.message}`, { userId, year, month });
      throw error;
    }
  }

  /**
   * 성장앨범 카테고리별 조회
   */
  async getGrowthAlbumsByCategory(userId, categoryId) {
    try {
      return await GrowthAlbum.getAlbumByCategory(userId, categoryId);
    } catch (error) {
      logger.error(`카테고리별 성장앨범 조회 실패: ${error.message}`, { userId, categoryId });
      throw error;
    }
  }

  /**
   * 전체 성장앨범 조회
   */
  async getAllGrowthAlbums(userId) {
    try {
      return await GrowthAlbum.find({ userId })
        .populate('taskId', 'title categoryId')
        .populate({
          path: 'taskId',
          populate: {
            path: 'categoryId',
            select: 'name color'
          }
        })
        .sort({ capturedAt: -1 })
        .limit(50);
    } catch (error) {
      logger.error(`전체 성장앨범 조회 실패: ${error.message}`, { userId });
      throw error;
    }
  }

  /**
   * Task 완료 상태 토글
   */
  async toggleTaskCompletion(userId, taskId, isCompleted) {
    try {
      const task = await Task.findOne({ _id: taskId, userId });
      if (!task) {
        throw new Error('Task를 찾을 수 없습니다.');
      }

      const previousState = task.isCompleted;
      task.isCompleted = isCompleted !== undefined ? isCompleted : !task.isCompleted;
      task.completedAt = task.isCompleted ? new Date() : null;

      await task.save();

      logger.info('Task 완료 상태 변경', {
        userId,
        taskId,
        previousState,
        newState: task.isCompleted
      });

      return task;
    } catch (error) {
      logger.error(`Task 완료 상태 변경 실패: ${error.message}`, { userId, taskId });
      throw error;
    }
  }

  /**
   * 하루 모든 Task 완료 체크 및 코인 지급
   */
  async checkDailyTaskCompletion(userId) {
    try {
      const User = require('../models/User');
      
      // 사용자 정보 조회
      const user = await User.findById(userId);
      if (!user || !user.isPremium) {
        return null; // 무료 사용자는 코인 지급 없음
      }

      // 오늘 날짜의 Task들 조회
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

      const todayTasks = await Task.find({
        userId,
        date: {
          $gte: startOfDay,
          $lte: endOfDay
        }
      });

      // Task가 없으면 코인 지급 없음
      if (todayTasks.length === 0) {
        return null;
      }

      // 모든 Task가 완료되었는지 확인
      const allCompleted = todayTasks.every(task => task.isCompleted);
      
      if (allCompleted) {
        // 오늘 이미 코인을 지급받았는지 확인
        const todayString = today.toISOString().split('T')[0];
        const alreadyRewarded = user.dailyRewards.some(
          reward => reward.date.toISOString().split('T')[0] === todayString && reward.type === 'task_completion'
        );

        if (!alreadyRewarded) {
          // 코인 지급
          const rewardAmount = 1;
          user.coins += rewardAmount;
          user.dailyRewards.push({
            type: 'task_completion',
            amount: rewardAmount,
            date: new Date()
          });

          await user.save();

          logger.info('Task 완료 코인 지급', {
            userId,
            rewardAmount,
            totalCoins: user.coins,
            completedTasks: todayTasks.length
          });

          return {
            rewarded: true,
            amount: rewardAmount,
            totalCoins: user.coins,
            message: '모든 할일을 완료하여 코인을 받았습니다!'
          };
        }
      }

      return null;
    } catch (error) {
      logger.error(`일일 Task 완료 체크 실패: ${error.message}`, { userId });
      throw error;
    }
  }
}

module.exports = new TaskService();
