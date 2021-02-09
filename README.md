- 版本: 1.5.3
- 作者: 陆秋石
- 日期: 2021 年 2 月 9 日

_注意: 此文档随时可能更新，请保持更新_

# 接口概览

## 通讯方式

- 根据部署环境

## 数据格式

请求体格式为`JSON`，需要在请求头中说明

正确的响应体格式为`JSON`，错误的响应体为一个错误信息的字符串

`Content-Type: application/json`

## 鉴权方式

除了不需要鉴权的接口，所有请求在请求头中需要加入用户的 token

不需要鉴权的接口`微信登录`，`获取配置`

`Authorization: <token>`

其中，token 可以在`微信登录`接口返回中获得。

# 系统和用户登录

## 获得系统配置

- 方法: `GET`
- 路径: `/api/config`
- 响应体: `Config`

## 微信登录

- 方法: `POST`
- 路径: `/api/wechat/login`
- 参数:
- 请求体: `WechatLoginPostBody`
- 响应体:

```
{
  "user": User,
  "token": "",
  "openid": "",
  "session_key": ""
}
```

## 获得当前用户信息

- 方法: `GET`
- 路径: `/api/auth/user`
- 参数:
- 响应体: `User`

# 订单

## 创建订单

- 方法: `POST`
- 路径: `/api/booking`
- 参数: `BookingPostQuery`
- 请求体: `BookingPostBody`
- 响应体: `Booking`

## 更新订单

- 方法: `PATCH`
- 路径: `/api/booking/<bookingId>`
- 参数:
- 请求体: `BookingPutBody`
- 响应体: `Booking`

## 获取订单列表

- 方法: `GET`
- 路径: `/api/booking`
- 参数: `BookingQuery`
- 响应体: `Booking[]`

# 卡券

## 获取卡券种类列表

- 方法: `GET`
- 路径: `/api/card-type`
- 参数: `CardTypeQuery`
- 响应体: `CardType[]`

## 创建卡券

- 方法: `GET`
- 路径: `/api/card`
- 参数: `CardPostQuery`
- 请求体: `CardPostBody`
- 响应体: `Card`

## 获取卡券列表

- 方法: `GET`
- 路径: `/api/card`
- 参数: `CardQuery`
- 响应体: `Card[]`

# 活动

## 获取活动列表

- 方法: `GET`
- 路径: `/api/event`
- 参数: `EventQuery`
- 响应体: `Event[]`

# 文章

## 获取文章列表

- 方法: `GET`
- 路径: `/api/post`
- 参数: `PostQuery`
- 响应体:`Post[]`

# 门店

## 获取门店列表

- 方法: `GET`
- 路径: `/api/store`
- 参数:
- 响应体: `Store[]`
