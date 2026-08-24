module.exports = {
  apps: [
    {
      name: "wapi-api",
      script: "apps/api/dist/index.js",
      cwd: "/home/wapi/app",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
