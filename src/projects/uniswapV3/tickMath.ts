import { BigInt, ByteArray, Bytes } from "@graphprotocol/graph-ts";

const str2BigInt = (str: string): BigInt => {
  return BigInt.fromUnsignedBytes(
    ByteArray.fromHexString(str).reverse() as ByteArray
  );
};

const MaxUint256 = str2BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

export function getSqrtRatioAtTick(tick: i32): BigInt {
  const absTick = tick < 0 ? BigInt.fromI32(tick).neg() : BigInt.fromI32(tick);

  let ratio = absTick.bitAnd(BigInt.fromI32(0x1)).notEqual(BigInt.fromI32(0))
    ? str2BigInt("0xfffcb933bd6fad37aa2d162d1a594001")
    : BigInt.fromI32(2).pow(128);

  if (absTick.bitAnd(BigInt.fromI32(0x2)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xfff97272373d413259a46990580e213a"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x4)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xfff2e50f5f656932ef12357cf3c7fdcc"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x8)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xffe5caca7e10e4e61c3624eaa0941cd0"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x10)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xffcb9843d60f6159c9db58835c926644"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x20)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xff973b41fa98c081472e6896dfb254c0"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x40)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xff2ea16466c96a3843ec78b326b52861"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x80)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xfe5dee046a99a2a811c461f1969c3053"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x100)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xfcbe86c7900a88aedcffc83b479aa3a4"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x200)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xf987a7253ac413176f2b074cf7815e54"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x400)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xf3392b0822b70005940c7a398e4b70f3"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x800)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xe7159475a2c29b7443b29c7fa6e889d9"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x1000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xd097f3bdfd2022b8845ad8f792aa5825"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x2000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0xa9f746462d870fdf8a65dc1f90e061e5"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x4000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0x70d869a156d2a1b890bb3df62baf32f7"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x8000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0x31be135f97d08fd981231505542fcfa6"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x10000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0x09aa508b5b7a84e1c677de54f3e99bc9"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x20000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0x005d6af8dedb81196699c329225ee604"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x40000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0x00002216e584f5fa1ea926041bedfe98"))
      .rightShift(128);
  }
  if (absTick.bitAnd(BigInt.fromI32(0x80000)).notEqual(BigInt.zero())) {
    ratio = ratio
      .times(str2BigInt("0x00000000048a170391f7dc42444e8fa2"))
      .rightShift(128);
  }

  if (tick > 0) {
    ratio = MaxUint256.div(ratio);
  }

  // this divides by 1<<32 rounding up to go from a Q128.128 to a Q128.96.
  // we then downcast because we know the result always fits within 160 bits due to our tick input constraint
  // we round up in the division so getTickAtSqrtRatio of the output price is always consistent
  //   return uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
  return ratio
    .rightShift(32)
    .plus(
      ratio.mod(BigInt.fromI32(1).leftShift(32)).equals(BigInt.zero())
        ? BigInt.zero()
        : BigInt.fromI32(1)
    );
}
