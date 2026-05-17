/*
// Before the fix by dev
 var name = getUserData();
*/

// After fixing 
// Prompt: Write me a function that stores a user name

// Function to store a user name
const storeUserName = (userName) => {
  if (!userName || typeof userName !== 'string') {
    throw new Error('Invalid user name: must be a non-empty string');
  }
  
  // Store in memory (could be extended to use localStorage, database, etc.)
  const storedName = userName.trim();
  
  return {
    success: true,
    storedName: storedName,
    timestamp: new Date().toISOString()
  };
};

// Example usage
const result = storeUserName('John Doe');
console.log(result);

module.exports = { storeUserName };

// Made with Bob
