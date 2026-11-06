"use client";
// One inline SVG icon set (lucide, tree-shaken per import). 24px grid,
// 1.75 stroke, round caps, currentColor. Replaces every emoji/text glyph.
import {
  Search, Mic, X, Menu, ChevronDown, ChevronRight, ChevronLeft, ChevronUp,
  ArrowLeft, ArrowRight, ArrowUp, Heart, ShoppingBag, ShoppingCartPlus, User, Package,
  Globe, Truck, ShieldCheck, RotateCcw, Star, Filter, SlidersHorizontal,
  LayoutGrid, Check, CheckCircle2, Info, AlertTriangle, Trash2, Plus, Minus,
  MapPin, Phone, CreditCard, Smartphone, Wallet, Gift, Sparkles, MoreHorizontal,
  BarChart3, ExternalLink, Clock, Home, Layers, Eye, Share2, Lock,
  BadgeCheck, MessageCircle, Cake, Landmark, PartyPopper, Send,
} from "lucide-react";

export const ICONS = {
  search: Search, mic: Mic, x: X, menu: Menu,
  "chevron-down": ChevronDown, "chevron-right": ChevronRight, "chevron-left": ChevronLeft, "chevron-up": ChevronUp,
  "arrow-left": ArrowLeft, "arrow-right": ArrowRight, "arrow-up": ArrowUp,
  heart: Heart, bag: ShoppingBag, "bag-plus": ShoppingCartPlus, user: User, package: Package,
  globe: Globe, truck: Truck, "shield-check": ShieldCheck, "rotate-ccw": RotateCcw,
  star: Star, filter: Filter, sliders: SlidersHorizontal, grid: LayoutGrid,
  check: Check, "check-circle": CheckCircle2, info: Info, alert: AlertTriangle,
  trash: Trash2, plus: Plus, minus: Minus, "map-pin": MapPin, phone: Phone,
  "credit-card": CreditCard, smartphone: Smartphone, wallet: Wallet, gift: Gift,
  sparkle: Sparkles, "more-horizontal": MoreHorizontal, "bar-chart": BarChart3,
  "external-link": ExternalLink, clock: Clock, home: Home, layers: Layers,
  eye: Eye, share: Share2, lock: Lock, "badge-check": BadgeCheck, chat: MessageCircle,
  cake: Cake, landmark: Landmark, party: PartyPopper, send: Send,
};

export function I({ name, size = 20, strokeWidth = 1.75, className = "", filled = false, ...rest }) {
  const C = ICONS[name] || Info;
  return <C size={size} strokeWidth={strokeWidth} className={className} aria-hidden="true"
            fill={filled ? "currentColor" : "none"} {...rest} />;
}
