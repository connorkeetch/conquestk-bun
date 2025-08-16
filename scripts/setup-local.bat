@echo off
echo Setting up Risk Game locally without Docker...

echo.
echo 1. Installing root dependencies...
call npm install

echo.
echo 2. Installing backend dependencies...
cd backend
call npm install
cd ..

echo.
echo 3. Installing frontend dependencies...
cd frontend
call npm install
cd ..

echo.
echo Setup complete! 
echo.
echo To start the application:
echo 1. Start PostgreSQL and Redis manually
echo 2. Run: npm run dev:manual
echo.
echo Or use Docker: npm run docker:up
pause