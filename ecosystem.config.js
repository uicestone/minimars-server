module.exports = {
  apps: {
    name: "minimars-server",
    // script: "./node_modules/.bin/ts-node",
    // args: "src/index.ts",
    script: "./dist/index.js",
    watch: "./dist",
    watch_delay: 30000,
    log_date_format: "YYYY-MM-DD HH:mm:ss.SSS (ZZ)",
    log: true,
    env: {
      TZ: "Asia/Shanghai"
    }
  },
  deploy: {
    testing: {
      user: "www-data",
      host: ["stirad.com"],
      ref: "origin/master",
      repo: "https://github.com/uicestone/minimars-server",
      path: "/var/www/minimars-server",
      "post-deploy":
        "yarn && yarn build && pm2 startOrRestart ecosystem.config.js"
    }
  }
};
