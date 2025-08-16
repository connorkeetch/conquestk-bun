-- Connect to risk_game database
\c risk_game;

-- Insert sample users (passwords are 'password123' hashed with bcrypt)
INSERT INTO users (username, email, password) VALUES
('john_doe', 'john@example.com', '$2a$10$7SPgfuK5qZGwV9K5qZGwVOxhY9K5qZGwV9K5qZGwV9K5qZGwV9K5qZ'),
('jane_smith', 'jane@example.com', '$2a$10$7SPgfuK5qZGwV9K5qZGwVOxhY9K5qZGwV9K5qZGwV9K5qZGwV9K5qZ'),
('bob_wilson', 'bob@example.com', '$2a$10$7SPgfuK5qZGwV9K5qZGwVOxhY9K5qZGwV9K5qZGwV9K5qZGwV9K5qZ'),
('alice_brown', 'alice@example.com', '$2a$10$7SPgfuK5qZGwV9K5qZGwVOxhY9K5qZGwV9K5qZGwV9K5qZGwV9K5qZ');

-- Insert player stats for all users
INSERT INTO player_stats (user_id, games_played, games_won, games_lost, total_playtime_minutes)
SELECT 
    id,
    FLOOR(RANDOM() * 50) + 1, -- 1-50 games played
    FLOOR(RANDOM() * 20) + 1, -- 1-20 games won
    FLOOR(RANDOM() * 30) + 1, -- 1-30 games lost
    FLOOR(RANDOM() * 3000) + 100 -- 100-3100 minutes playtime
FROM users;

-- Insert sample game rooms
INSERT INTO game_rooms (name, host_id, max_players, is_private, status)
SELECT 
    'Sample Room ' || row_number() OVER (),
    u.id,
    CASE WHEN random() < 0.5 THEN 4 ELSE 6 END,
    random() < 0.3, -- 30% chance of being private
    CASE 
        WHEN random() < 0.6 THEN 'waiting'
        WHEN random() < 0.9 THEN 'in_progress'
        ELSE 'finished'
    END
FROM (SELECT id FROM users ORDER BY random() LIMIT 3) u;

-- Insert sample custom map
INSERT INTO custom_maps (name, creator_id, map_data, is_public)
SELECT 
    'Classic World Map',
    u.id,
    '{
        "territories": [
            {
                "id": "alaska",
                "name": "Alaska",
                "continent": "north-america",
                "position": {"x": 50, "y": 100},
                "adjacentTerritories": ["northwest-territory", "alberta", "kamchatka"]
            },
            {
                "id": "northwest-territory",
                "name": "Northwest Territory",
                "continent": "north-america",
                "position": {"x": 150, "y": 100},
                "adjacentTerritories": ["alaska", "alberta", "ontario", "greenland"]
            }
        ],
        "continents": [
            {
                "id": "north-america",
                "name": "North America",
                "bonus": 5,
                "territories": ["alaska", "northwest-territory", "alberta", "ontario", "greenland", "eastern-united-states", "western-united-states", "central-america", "quebec"]
            }
        ]
    }'::jsonb,
    true
FROM users u
LIMIT 1;