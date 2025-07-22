const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'FIVLO API',
      version: '1.0.0',
      description: 'FIVLO 백엔드 API 문서 - 집중력 개선, 루틴 형성, 목표 관리를 위한 종합 서비스',
      contact: {
        name: 'FIVLO 개발팀',
        email: 'dev@fivlo.com'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: '개발 서버'
      },
      {
        url: 'https://api.fivlo.com',
        description: '프로덕션 서버'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: '에러 메시지'
            },
            details: {
              type: 'array',
              items: {
                type: 'object'
              }
            }
          }
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: '성공 메시지'
            },
            data: {
              type: 'object'
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com'
            },
            profileName: {
              type: 'string',
              example: '사용자명'
            },
            userType: {
              type: 'string',
              enum: ['focus', 'routine', 'goal'],
              example: 'focus'
            },
            isPremium: {
              type: 'boolean',
              example: false
            },
            coins: {
              type: 'number',
              example: 100
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Task: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            title: {
              type: 'string',
              example: '영어 공부하기'
            },
            description: {
              type: 'string',
              example: '토익 리스닝 연습'
            },
            date: {
              type: 'string',
              format: 'date'
            },
            isCompleted: {
              type: 'boolean',
              example: false
            },
            category: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string'
                },
                name: {
                  type: 'string',
                  example: '공부'
                },
                color: {
                  type: 'string',
                  example: '#3B82F6'
                }
              }
            },
            priority: {
              type: 'string',
              enum: ['낮음', '보통', '높음'],
              example: '보통'
            },
            estimatedTime: {
              type: 'number',
              example: 25
            }
          }
        },
        PomodoroSession: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            title: {
              type: 'string',
              example: '공부하기'
            },
            status: {
              type: 'string',
              enum: ['focus', 'short_break', 'long_break', 'completed', 'paused'],
              example: 'focus'
            },
            currentCycle: {
              type: 'number',
              example: 1
            },
            totalCycles: {
              type: 'number',
              example: 4
            },
            timeRemaining: {
              type: 'number',
              example: 1500
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        ShopItem: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            name: {
              type: 'string',
              example: '기본 티셔츠'
            },
            description: {
              type: 'string',
              example: '오분이의 기본 티셔츠입니다.'
            },
            category: {
              type: 'string',
              enum: ['top', 'bottom', 'accessory', 'background'],
              example: 'top'
            },
            price: {
              type: 'number',
              example: 10
            },
            rarity: {
              type: 'string',
              enum: ['common', 'rare', 'epic', 'legendary'],
              example: 'common'
            },
            imageUrl: {
              type: 'string',
              example: '/images/items/basic-tshirt.png'
            },
            isOwned: {
              type: 'boolean',
              example: false
            }
          }
        },
        Reminder: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            title: {
              type: 'string',
              example: '약 챙기기'
            },
            time: {
              type: 'string',
              format: 'time',
              example: '08:00'
            },
            days: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
              },
              example: ['mon', 'tue', 'wed', 'thu', 'fri']
            },
            isActive: {
              type: 'boolean',
              example: true
            },
            location: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  example: '집'
                },
                latitude: {
                  type: 'number',
                  example: 37.5665
                },
                longitude: {
                  type: 'number',
                  example: 126.9780
                },
                radius: {
                  type: 'integer',
                  example: 100
                }
              }
            },
            isPremiumFeature: {
              type: 'boolean',
              example: false
            },
            completionHistory: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: {
                    type: 'string',
                    format: 'date'
                  },
                  completed: {
                    type: 'boolean'
                  }
                }
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        Category: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            name: {
              type: 'string',
              example: '공부'
            },
            color: {
              type: 'string',
              example: '#3B82F6'
            },
            isDefault: {
              type: 'boolean',
              example: false
            },
            taskCount: {
              type: 'integer',
              example: 5
            }
          }
        },
        AIGoal: {
          type: 'object',
          properties: {
            _id: {
              type: 'string'
            },
            originalGoal: {
              type: 'object',
              properties: {
                goal: {
                  type: 'string',
                  example: '영어 회화 실력 향상하기'
                },
                duration: {
                  type: 'string',
                  example: '3개월'
                },
                experienceLevel: {
                  type: 'string',
                  example: '초보'
                }
              }
            },
            aiAnalysis: {
              type: 'object',
              properties: {
                analysis: {
                  type: 'string',
                  example: '체계적인 학습 계획이 필요합니다...'
                },
                timeline: {
                  type: 'string',
                  example: '12주 과정'
                },
                difficulty: {
                  type: 'string',
                  enum: ['easy', 'medium', 'hard'],
                  example: 'medium'
                }
              }
            },
            generatedTasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: {
                    type: 'string',
                    example: '기초 문법 복습'
                  },
                  priority: {
                    type: 'string',
                    example: 'high'
                  },
                  estimatedTime: {
                    type: 'string',
                    example: '25분'
                  }
                }
              }
            },
            status: {
              type: 'string',
              enum: ['draft', 'active', 'completed', 'paused'],
              example: 'active'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: [
    './src/routes/auth.js',
    './src/routes/ai.js', 
    './src/routes/analytics.js',
    './src/routes/coins.js',
    './src/routes/customization.js',
    './src/routes/pomodoro.js',
    './src/routes/reminders.js',
    './src/routes/shop.js',
    './src/routes/task.js',
    './src/routes/timeAttack.js',
    './docs/swagger/*.yaml' // 추가 스웨거 문서들
  ],
};

const specs = swaggerJsdoc(options);

module.exports = {
  specs,
  swaggerUi,
  swaggerJsdoc
};
