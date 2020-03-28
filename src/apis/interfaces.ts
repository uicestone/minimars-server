import { Booking } from "../models/Booking";
import { PaymentGateway, Payment } from "../models/Payment";
import { Card } from "../models/Card";
import { CardType } from "../models/CardType";
import { Event } from "../models/Event";
import { Gift } from "../models/Gift";
import { Post } from "../models/Post";
import { Store } from "../models/Store";
import { User } from "../models/User";

export interface AuthLoginPostBody {
  login: string;
  password: string;
}

export interface AuthLoginResponseBody {
  token: string;
  user: User;
}

export interface ListQuery {
  order?: string;
  limit?: number;
}

export interface AuthTokenUserIdResponseBody extends AuthLoginResponseBody {}

export interface BookingPostBody extends Booking {}

export interface BookingPutBody extends Booking {}

export interface BookingPostQuery {
  paymentGateway?: PaymentGateway;
  useBalance?: "false";
  adminAddWithoutPayment?: boolean;
}

export interface BookingQuery extends ListQuery {
  status?: string; // support comma separated values
  customerKeyword?: string;
  type?: string;
  store?: string;
  date?: string;
  customer?: string;
  event?: string;
  gift?: string;
  coupon?: string;
}

export interface BookingPricePostBody extends Booking {}

export interface BookingPriceResponseBody {
  price: number;
  priceInPoints?: number;
}

export interface CardPostBody extends Card {}

export interface CardPutBody extends Card {}

export interface CardPostQuery {
  paymentGateway?: PaymentGateway;
  adminAddWithoutPayment?: boolean;
}

export interface CardQuery extends ListQuery {
  status?: string; // support comma separated values
  customer?: string;
}

export interface CardTypePostBody extends CardType {}

export interface CardTypePutBody extends CardType {}

export interface CardTypeQuery extends ListQuery {}

export interface EventPostBody extends Event {}

export interface EventPutBody extends Event {}

export interface EventQuery extends ListQuery {
  keyword?: string;
  store?: string;
}

export interface GiftPostBody extends Gift {}

export interface GiftPutBody extends Gift {}

export interface GiftQuery extends ListQuery {
  keyword?: string;
  store?: string;
}

export interface PaymentPostBody extends Payment {}

export interface PaymentPutBody extends Payment {}

export interface PaymentQuery extends ListQuery {
  date?: string;
  paid?: "false";
  customer?: string;
  attach?: string;
  gateway?: PaymentGateway;
  direction?: "payment" | "refund";
}

export interface PostPostBody extends Post {}

export interface PostPutBody extends Post {}

export interface PostQuery extends ListQuery {
  slug?: string;
  tag?: string;
}

export interface StorePostBody extends Store {}

export interface StorePutBody extends Store {}

export interface StoreQuery extends ListQuery {}

export interface UserPostBody extends User {}

export interface UserPutBody extends User {}

export interface UserQuery extends ListQuery {
  keyword: string;
  role: string;
  membership: string[];
  cardTypes: string[];
}
