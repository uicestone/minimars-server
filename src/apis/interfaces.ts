import { IBooking } from "../models/Booking";
import { Gateways, IPayment } from "../models/Payment";
import { ICard } from "../models/Card";
import { ICardType } from "../models/CardType";
import { IEvent } from "../models/Event";
import { IGift } from "../models/Gift";
import { IPost } from "../models/Post";
import { IStore } from "../models/Store";
import { IUser } from "../models/User";

export interface AuthLoginPostBody {
  login: string;
  password: string;
}

export interface AuthLoginResponseBody {
  token: string;
  user: IUser;
}

export interface ListQuery {
  order?: string;
  limit?: number;
}

export interface AuthTokenUserIdResponseBody extends AuthLoginResponseBody {}

export interface BookingPostBody extends IBooking {}

export interface BookingPutBody extends IBooking {}

export interface BookingPostQuery {
  paymentGateway?: Gateways;
  useBalance?: "false";
}

export interface BookingQuery extends ListQuery {
  status?: string;
  customerKeyword?: string;
  type?: string;
  store?: string;
  date?: string;
  customer?: string;
  coupon?: string;
}

export interface BookingPricePostBody extends IBooking {}

export interface CardPostBody extends ICard {}

export interface CardPutBody extends ICard {}

export interface CardQuery extends ListQuery {}

export interface CardTypePostBody extends ICardType {}

export interface CardTypePutBody extends ICardType {}

export interface CardTypeQuery extends ListQuery {}

export interface EventPostBody extends IEvent {}

export interface EventPutBody extends IEvent {}

export interface EventQuery extends ListQuery {}

export interface GiftPostBody extends IGift {}

export interface GiftPutBody extends IGift {}

export interface GiftQuery extends ListQuery {}

export interface PaymentPostBody extends IPayment {}

export interface PaymentPutBody extends IPayment {}

export interface PaymentQuery extends ListQuery {
  date?: string;
  paid?: "false";
  customer?: IUser;
  attach?: string;
  gateway?: Gateways;
  direction?: "payment" | "refund";
}

export interface PostPostBody extends IPost {}

export interface PostPutBody extends IPost {}

export interface PostQuery extends ListQuery {
  slug?: string;
  tag?: string;
}

export interface StorePostBody extends IStore {}

export interface StorePutBody extends IStore {}

export interface StoreQuery extends ListQuery {}

export interface UserPostBody extends IUser {}

export interface UserPutBody extends IUser {}

export interface UserQuery extends ListQuery {
  keyword: string;
  role: string;
  membership: string[];
  cardTypes: string[];
}
