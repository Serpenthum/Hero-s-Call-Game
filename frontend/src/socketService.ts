import { io, Socket } from 'socket.io-client';
import { SocketEvents } from './types';

class SocketService {
  private socket: Socket<SocketEvents> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  connect(): Socket<SocketEvents> {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.socket = io('http://localhost:3001', {
      transports: ['websocket'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
    });

    this.socket.on('connect', () => {
      console.log('Connected to server');
      this.reconnectAttempts = 0;
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected from server:', reason);
    });

    (this.socket as any).on('reconnect', (attemptNumber: number) => {
      console.log('Reconnected after', attemptNumber, 'attempts');
      this.reconnectAttempts = 0;
    });

    (this.socket as any).on('reconnect_error', (error: any) => {
      console.error('Reconnection failed:', error);
      this.reconnectAttempts++;
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket<SocketEvents> | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  // Authentication method
  authenticate(userId: number) {
    this.socket?.emit('authenticate', { userId });
  }

  // Game-specific methods
  joinGame(playerName: string, mode: 'draft' | 'random' = 'draft') {
    console.log(`📡 SocketService joining game with name: "${playerName}", mode: ${mode}`);
    this.socket?.emit('join-game', { name: playerName, mode });
  }

  joinSurvivalGame(playerName: string, team: any[]) {
    console.log(`📡 SocketService joining survival game with name: "${playerName}", team: ${team.map(h => h.name).join(', ')}`);
    this.socket?.emit('join-survival-game', { name: playerName, team });
  }

  cancelSurvivalSearch() {
    this.socket?.emit('cancel-survival-search');
  }

  cancelSearch() {
    this.socket?.emit('cancel-search');
  }

  createFriendlyRoom(roomName: string, playerName: string) {
    console.log(`📡 SocketService creating friendly room "${roomName}" with name: "${playerName}"`);
    this.socket?.emit('create-friendly-room', { roomName, playerName });
  }

  joinFriendlyRoom(roomName: string, playerName: string) {
    console.log(`📡 SocketService joining friendly room "${roomName}" with name: "${playerName}"`);
    this.socket?.emit('join-friendly-room', { roomName, playerName });
  }

  banCard(cardName: string) {
    this.socket?.emit('ban-card', { cardName });
  }

  pickCard(cardName: string) {
    this.socket?.emit('pick-card', { cardName });
  }

  setAttackOrder(heroOrder: string[]) {
    this.socket?.emit('set-attack-order', { heroOrder });
  }

  rollInitiative() {
    this.socket?.emit('roll-initiative');
  }

  chooseTurnOrder(goFirst: boolean) {
    this.socket?.emit('choose-turn-order', { goFirst });
  }

  selectTarget(targetId: string) {
    console.log('📡 SocketService sending select-target:', targetId);
    this.socket?.emit('select-target', { targetId });
  }

  basicAttack(targetId: string) {
    this.socket?.emit('basic-attack', { targetId });
  }

  useAbility(abilityIndex: number, targetId: string, allyTargetId?: string) {
    this.socket?.emit('use-ability', { abilityIndex, targetId, allyTargetId });
  }

  useTimekeeperSelectedAbility(timekeeperTargetId: string, allyTargetId: string, selectedAbilityIndex: number) {
    this.socket?.emit('use-timekeeper-selected-ability', { 
      timekeeperTargetId, 
      allyTargetId, 
      selectedAbilityIndex 
    });
  }

  activateSpecial() {
    this.socket?.emit('activate-special');
  }

  endTurn() {
    this.socket?.emit('end-turn');
  }

  surrenderGame() {
    this.socket?.emit('surrender-game');
  }

  autoDraft() {
    this.socket?.emit('auto-draft');
  }

  reconnectGame(gameId: string, playerName: string) {
    this.socket?.emit('reconnect-game', { gameId, playerName });
  }

  // Survival state methods
  getSurvivalState() {
    this.socket?.emit('get-survival-state');
  }

  resetSurvivalState() {
    this.socket?.emit('reset-survival-state');
  }

  returnToLobby() {
    console.log('📡 SocketService sending return-to-lobby');
    this.socket?.emit('return-to-lobby');
  }

  // Friends system methods
  getOnlinePlayers() {
    this.socket?.emit('get-online-players');
  }

  sendFriendRequest(username: string) {
    this.socket?.emit('send-friend-request', { username });
  }

  respondToFriendRequest(requesterId: number, accept: boolean) {
    this.socket?.emit('respond-friend-request', { requesterId, accept });
  }

  getFriendRequests() {
    this.socket?.emit('get-friend-requests');
  }

  removeFriend(friendId: number) {
    this.socket?.emit('remove-friend', { friendId });
  }

  sendMessage(targetUserId: number, message: string) {
    this.socket?.emit('send-message', { targetUserId, message });
  }

  getMessages(targetUserId: number, limit?: number) {
    this.socket?.emit('get-messages', { targetUserId, limit });
  }

  // Spectator methods
  getSpectatableGames() {
    this.socket?.emit('get-spectatable-games');
  }

  checkPlayerSpectatable(playerId: string) {
    this.socket?.emit('check-player-spectatable', { playerId });
  }

  spectateGame(gameId: string, spectatingPlayerId: string) {
    console.log('📡 SocketService spectating game:', gameId, 'watching player:', spectatingPlayerId);
    this.socket?.emit('spectate-game', { gameId, spectatingPlayerId });
  }

  leaveSpectate() {
    console.log('📡 SocketService leaving spectate');
    this.socket?.emit('leave-spectate');
  }

  getSpectatorInfo(gameId: string) {
    this.socket?.emit('get-spectator-info', { gameId });
  }
}

export const socketService = new SocketService();