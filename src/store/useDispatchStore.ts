/*
 * @Author: hhr
 * @Date: 2026-04-19 15:09:41
 * @LastEditTime: 2026-07-01 10:31:08
 * @LastEditors: hhr
 * @Description: 文件描述s 
 * @FilePath: \ids-gis-web\src\store\useDispatchStore.ts
 */
import { defineStore } from 'pinia';
import { reactive, toRefs, onUnmounted } from 'vue';
// import { WebSocketClient } from '@/hooks/useWebSocket';
// import { createEncryptedPersistStorage } from '@/hooks/useEncryptedStorage'

// const encryptedStorage = createEncryptedPersistStorage({
//   secretKey: import.meta.env.VITE_PERSIST_SECRET_KEY || 'dispatch-model-map',
//   prefix: 'PINIA:',
// })

export const useDispatchStore = defineStore('dispatchStore', () => {
  const state = reactive({
    // 外部调派数据
    dispatch: {
      fireBrigade: [
        {
          gisX: 114.314521,
          gisY: 22.543021,
          name: '消防支队',
          info: {
            name: '消防支队',
            address: '北京市海淀区',
            phone: '13800000000',
          },
          status: '待调',
          type: '消防支队',
        }
      ],
    }, // 调派数据

    alarmData: {
      gisX: null,
      gisY: null,
      info: {},
      buildId: null,
    }, // 报警数据

    // 内部调派数据
    navPathPlanData: {} as Record<string, { fullPath: any[], tmcs: any[] }[]>, // 导航路径计划数据
    wsStatus: false,
  });

  const setDispatch = (d: any) => {
    Object.assign(state, d);
  };

  // const wsClient = new WebSocketClient(import.meta.env.VITE_WS_URL, {
  //   heartbeatMessage: { type: 'ping' },
  //   onOpen: () => {
  //     state.wsStatus = true;
  //     console.log('调度 WebSocket 连接成功');
  //   },
  //   onMessage: (data) => {
  //     // 收到推送消息后，动态更新调派数据或报警数据
  //     console.log('调度 WebSocket 收到消息:', data);
  //     switch (data?.type) {
  //       case 'dispatchUpdate':
  //         setDispatch({ dispatch: data.payload });
  //         break;
  //       case 'alarmUpdate':
  //         setDispatch({ alarmData: data.payload });
  //         break;
  //       default:
  //         break;
  //     }
  //   },
  //   onClose: () => {
  //     state.wsStatus = false;
  //     console.log('调度 WebSocket 连接关闭');
  //   }
  // });

  const sendWsMessage = (data: any) => {
    // wsClient.send(data);
  };

  onUnmounted(() => {
    // wsClient.disconnect();
  });

  return {
    ...toRefs(state),
    setDispatch,
    sendWsMessage,
  };
}, {
  persist: {
    storage: localStorage,
  },
});

