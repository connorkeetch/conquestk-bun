import { initDatabase, query } from './config/database';
import { UserService } from './services/userService';
import { GameRoomService } from './services/gameRoomService';

async function testDatabase() {
  console.log(`Testing database with DB_TYPE: ${process.env.DB_TYPE || 'postgresql'}`);
  
  try {
    // Initialize database
    await initDatabase();
    console.log('✓ Database initialized successfully');

    // Test UserService
    const userService = new UserService();
    const testUser = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'hashedpassword123'
    };

    console.log('Testing UserService...');
    const createdUser = await userService.create(testUser);
    console.log('✓ User created:', createdUser.id);

    const foundUser = await userService.findById(createdUser.id);
    console.log('✓ User found by ID:', foundUser?.username);

    const foundByEmail = await userService.findByEmail(testUser.email);
    console.log('✓ User found by email:', foundByEmail?.username);

    // Test GameRoomService
    const gameRoomService = new GameRoomService();
    const testRoom = {
      name: 'Test Room',
      hostId: createdUser.id,
      maxPlayers: 4,
      isPrivate: false,
      status: 'waiting' as const
    };

    console.log('Testing GameRoomService...');
    const createdRoom = await gameRoomService.createRoom(testRoom);
    console.log('✓ Room created:', createdRoom.id);

    const foundRoom = await gameRoomService.getRoomById(createdRoom.id);
    console.log('✓ Room found:', foundRoom?.name);

    const activeRooms = await gameRoomService.getActiveRooms();
    console.log('✓ Active rooms count:', activeRooms.length);

    // Test joining room
    const joinResult = await gameRoomService.joinRoom(createdRoom.id, createdUser.id);
    console.log('✓ Room join result:', joinResult.message);

    // Clean up
    await query(
      process.env.DB_TYPE === 'sqlite' 
        ? 'DELETE FROM room_players WHERE room_id = ?' 
        : 'DELETE FROM room_players WHERE room_id = $1', 
      [createdRoom.id]
    );
    await query(
      process.env.DB_TYPE === 'sqlite' 
        ? 'DELETE FROM game_rooms WHERE id = ?' 
        : 'DELETE FROM game_rooms WHERE id = $1', 
      [createdRoom.id]
    );
    await query(
      process.env.DB_TYPE === 'sqlite' 
        ? 'DELETE FROM users WHERE id = ?' 
        : 'DELETE FROM users WHERE id = $1', 
      [createdUser.id]
    );

    console.log('✓ All tests passed and cleaned up!');
  } catch (error) {
    console.error('✗ Test failed:', error);
    process.exit(1);
  }
}

testDatabase();