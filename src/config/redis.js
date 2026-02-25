// Redis implementation
const redis = require('redis');
const redisClient = redis.createClient();

await redisClient.setEx(`temp_reg:${email}`, 600, JSON.stringify(tempUserData));
const tempData = JSON.parse(await redisClient.get(`temp_reg:${email}`));