import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { WS_URL } from '../config';

export const useSocket = (handlers) => {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const newSocket = io(WS_URL);
    setSocket(newSocket);

    if (handlers) {
      Object.entries(handlers).forEach(([event, handler]) => {
        newSocket.on(event, handler);
      });
    }

    return () => {
      newSocket.disconnect();
    };
  }, []); // Handlers need to be stable (wrapped in useCallback) or we omit from deps

  return socket;
};
