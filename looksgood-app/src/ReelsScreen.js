import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Video } from "expo-av";
import { Ionicons } from "@expo/vector-icons";
import { useStripe } from "@stripe/stripe-react-native";
import API from "./services/api";
import { colors, fonts, radius } from "./theme";
import { BodyText, Screen } from "./ui";

const VIDEO_PATTERN = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;

function isVideoUrl(uri) {
  const value = String(uri || "").toLowerCase();
  if (!value) return false;
  return VIDEO_PATTERN.test(value) || value.includes("/video/upload/") || value.includes("/video/");
}

export default function ReelsScreen({ navigation }) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionBusyMap, setActionBusyMap] = useState({});
  const [topBarHeight, setTopBarHeight] = useState(56);
  const [errorHeight, setErrorHeight] = useState(0);
  const [listHeight, setListHeight] = useState(0);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutTags, setCheckoutTags] = useState([]);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cartItems, setCartItems] = useState({});
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const reelLayout = useMemo(() => {
    const reservedTop = topBarHeight + (error ? errorHeight + 8 : 0);
    const fallbackHeight = Math.max(screenHeight - reservedTop - 20, 220);
    const availableHeight = Math.max((listHeight > 0 ? listHeight - 12 : fallbackHeight), 220);
    const availableWidth = Math.max(screenWidth - 20, 180);

    // Keep reels in a stable 9:16 portrait frame that always fits viewport.
    const heightFromWidth = Math.round((availableWidth * 16) / 9);
    const reelHeight = Math.min(availableHeight, heightFromWidth);
    const reelWidth = Math.min(availableWidth, Math.round((reelHeight * 9) / 16));

    return { width: reelWidth, height: reelHeight };
  }, [error, errorHeight, listHeight, screenHeight, screenWidth, topBarHeight]);

  const formatProductPrice = (product) => {
    const cents = Number(product?.price_cents);
    const currency = String(product?.currency || "USD").toUpperCase();
    if (Number.isFinite(cents)) {
      return `${currency} ${(cents / 100).toFixed(2)}`;
    }
    const raw = Number(product?.price);
    if (Number.isFinite(raw)) {
      return `${currency} ${raw.toFixed(2)}`;
    }
    return currency;
  };

  const openCheckout = (tags) => {
    setCheckoutTags(Array.isArray(tags) ? tags : []);
    setCartItems({});
    setCheckoutOpen(true);
  };

  const resolvePriceCents = (product) => {
    const cents = Number(product?.price_cents);
    if (Number.isFinite(cents)) return cents;
    const raw = Number(product?.price);
    if (Number.isFinite(raw)) return Math.round(raw * 100);
    return 0;
  };

  const cartEntries = useMemo(() => {
    return (Array.isArray(checkoutTags) ? checkoutTags : [])
      .map((product) => ({
        product,
        quantity: Number(cartItems[product.id] || 0),
      }))
      .filter((entry) => entry.quantity > 0);
  }, [checkoutTags, cartItems]);

  const cartTotalCents = useMemo(() => {
    return cartEntries.reduce((sum, entry) => sum + resolvePriceCents(entry.product) * entry.quantity, 0);
  }, [cartEntries]);

  const cartCurrency = useMemo(() => {
    const currencies = new Set(cartEntries.map((entry) => String(entry.product?.currency || "USD").toUpperCase()));
    if (currencies.size === 1) return Array.from(currencies)[0];
    return currencies.size ? "MIX" : "USD";
  }, [cartEntries]);

  const setCartQty = (product, nextQty) => {
    if (!product) return;
    const maxQty = Math.max(0, Number(product.inventory_count || 0));
    const safeQty = Math.max(0, Math.min(nextQty, maxQty));
    setCartItems((prev) => {
      const next = { ...prev };
      if (safeQty <= 0) {
        delete next[product.id];
      } else {
        next[product.id] = safeQty;
      }
      return next;
    });
  };

  const startCheckoutCart = async () => {
    if (checkoutBusy) return;
    if (!cartEntries.length) {
      Alert.alert("Cart empty", "Add at least one item to checkout.");
      return;
    }
    if (!process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      Alert.alert("Stripe not configured", "Add EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to .env.local to enable payments.");
      return;
    }
    setCheckoutBusy(true);
    try {
      const response = await API.post("/commerce/payment-sheet", {
        items: cartEntries.map((entry) => ({ product_id: entry.product.id, quantity: entry.quantity })),
      });
      const clientSecret = response?.data?.payment_intent_client_secret;
      if (!clientSecret) {
        throw new Error("Payment intent missing.");
      }
      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: "LooksGood",
        paymentIntentClientSecret: clientSecret,
        returnURL: "looksgoodapp://stripe-redirect",
        allowsDelayedPaymentMethods: true,
      });
      if (initError) {
        throw new Error(initError.message || "Unable to initialize payment.");
      }
      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== "Canceled") {
          throw new Error(presentError.message || "Payment failed.");
        }
        return;
      }
      setCheckoutOpen(false);
      Alert.alert("Payment complete", "Thanks! Your order is processing.");
    } catch (err) {
      Alert.alert("Checkout failed", err?.message || "Unable to start checkout.");
    } finally {
      setCheckoutBusy(false);
    }
  };


  const loadReels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [feedRes, subscriptionRes] = await Promise.allSettled([API.get("/feed/"), API.get("/subscription/status")]);
      if (feedRes.status !== "fulfilled") {
        throw feedRes.reason;
      }
      const plan =
        subscriptionRes.status === "fulfilled" ? String(subscriptionRes.value?.data?.plan || "free").toLowerCase() : "free";
      const showAds = plan === "free";
      const rows = Array.isArray(feedRes.value?.data) ? feedRes.value.data : [];
      setItems(
        rows.filter((x) => (showAds ? true : !x?.sponsored) && (x.media_url || x.video_url))
      );
    } catch (err) {
      setError(err?.message || "Unable to load reels");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReels();
  }, [loadReels]);

  const patchReelById = useCallback((postId, patch) => {
    const targetId = Number(postId);
    if (!Number.isFinite(targetId)) return;
    setItems((prev) =>
      prev.map((entry) => {
        if (Number(entry?.id) !== targetId) return entry;
        const nextPatch = typeof patch === "function" ? patch(entry) : patch;
        return { ...entry, ...nextPatch };
      })
    );
  }, []);

  const toggleLike = useCallback(
    async (item) => {
      const postId = Number(item?.id);
      if (!Number.isFinite(postId)) return;
      const liked = Boolean(item?.liked_by_me);
      const currentLikes = Number(item?.likes_count || 0);
      patchReelById(postId, {
        liked_by_me: !liked,
        likes_count: Math.max(0, currentLikes + (liked ? -1 : 1)),
      });

      try {
        const res = liked ? await API.delete(`/social/posts/${postId}/like`) : await API.post(`/social/posts/${postId}/like`);
        const likesCount = Number(res?.data?.likes_count);
        patchReelById(postId, {
          liked_by_me: !liked,
          likes_count: Number.isFinite(likesCount) ? likesCount : Math.max(0, currentLikes + (liked ? -1 : 1)),
        });
      } catch (err) {
        patchReelById(postId, { liked_by_me: liked, likes_count: currentLikes });
        Alert.alert("Action failed", err?.message || "Could not update like.");
      }
    },
    [patchReelById]
  );

  const shareReel = useCallback(
    async (item) => {
      const postId = Number(item?.id);
      if (!Number.isFinite(postId)) return;
      try {
        const res = await API.post(`/social/posts/${postId}/share`);
        const sharesCount = Number(res?.data?.shares_count);
        if (Number.isFinite(sharesCount)) {
          patchReelById(postId, { shares_count: sharesCount });
        }
        await Share.share({
          message: `Watch @${item.user}'s reel: ${item.media_url || item.video_url}`,
        });
      } catch (err) {
        Alert.alert("Share failed", err?.message || "Could not share this reel.");
      }
    },
    [patchReelById]
  );

  const repostReel = useCallback(
    async (item) => {
      const postId = Number(item?.id);
      if (!Number.isFinite(postId) || actionBusyMap[postId]) return;
      const mediaUrl = String(item?.media_url || item?.video_url || "").trim();
      if (!mediaUrl) return;

      setActionBusyMap((prev) => ({ ...prev, [postId]: true }));
      try {
        try {
          await API.post(`/social/posts/${postId}/share`);
        } catch (_shareErr) {
          // Repost creation can continue even if share activity logging fails.
        }
        const caption = `Repost from @${item.user || "creator"} ${String(item?.caption || "").trim()}`.trim().slice(0, 500);
        await API.post("/video/publish-from-url", {
          media_url: mediaUrl,
          caption,
        });
        Alert.alert("Reposted", "Reel reposted to your feed.");
      } catch (err) {
        Alert.alert("Repost failed", err?.message || "Could not repost this reel.");
      } finally {
        setActionBusyMap((prev) => {
          const next = { ...prev };
          delete next[postId];
          return next;
        });
      }
    },
    [actionBusyMap]
  );

  const downloadReel = useCallback(async (item) => {
    const mediaUrl = String(item?.media_url || item?.video_url || "").trim();
    if (!mediaUrl) return;
    try {
      const postId = Number(item?.id);
      if (Number.isFinite(postId)) {
        try {
          await API.post(`/social/posts/${postId}/save`);
        } catch (_saveErr) {
          // Keep download working even if save activity fails.
        }
      }
      const canOpen = await Linking.canOpenURL(mediaUrl);
      if (canOpen) {
        await Linking.openURL(mediaUrl);
        return;
      }
      await Share.share({ message: mediaUrl });
    } catch (err) {
      Alert.alert("Download failed", err?.message || "Could not open media link.");
    }
  }, []);

  const checkoutModal = checkoutTags.length ? (
    <Modal transparent animationType="fade" visible={checkoutOpen} onRequestClose={() => setCheckoutOpen(false)}>
      <View style={styles.checkoutBackdrop}>
        <View style={styles.checkoutCard}>
          <Text style={styles.checkoutTitle}>Shop this look</Text>
          <ScrollView contentContainerStyle={styles.checkoutList} showsVerticalScrollIndicator={false}>
            {checkoutTags.map((product) => {
              const available = product?.is_active !== false && Number(product?.inventory_count || 0) > 0;
              const maxQty = Math.max(0, Number(product?.inventory_count || 0));
              const qty = Number(cartItems[product.id] || 0);
              const disableMinus = qty <= 0;
              const disablePlus = !available || qty >= maxQty;
              return (
                <View key={`reel-checkout-${product.id}`} style={styles.checkoutItem}>
                  <View style={styles.checkoutItemInfo}>
                    <Text style={styles.checkoutItemTitle}>{product?.name || "Product"}</Text>
                    <Text style={styles.checkoutItemMeta}>
                      {available
                        ? `${formatProductPrice(product)} · ${Number(product?.inventory_count || 0)} left`
                        : "Sold out"}
                    </Text>
                  </View>
                  <View style={styles.checkoutQtyControls}>
                    <Pressable
                      onPress={() => setCartQty(product, qty - 1)}
                      disabled={disableMinus}
                      style={[styles.checkoutQtyButton, disableMinus && styles.checkoutQtyButtonDisabled]}>
                      <Ionicons name="remove" size={14} color={disableMinus ? "#AAAAAA" : "#1E1E1E"} />
                    </Pressable>
                    <Text style={styles.checkoutQtyText}>{qty}</Text>
                    <Pressable
                      onPress={() => setCartQty(product, qty + 1)}
                      disabled={disablePlus}
                      style={[styles.checkoutQtyButton, disablePlus && styles.checkoutQtyButtonDisabled]}>
                      <Ionicons name="add" size={14} color={disablePlus ? "#AAAAAA" : "#1E1E1E"} />
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
          <View style={styles.checkoutSummary}>
            <View>
              <Text style={styles.checkoutSummaryLabel}>Subtotal</Text>
              <Text style={styles.checkoutSummaryValue}>
                {cartEntries.length
                  ? cartCurrency === "MIX"
                    ? "Mixed currency"
                    : `${cartCurrency} ${(cartTotalCents / 100).toFixed(2)}`
                  : "No items yet"}
              </Text>
            </View>
            <Pressable
              onPress={startCheckoutCart}
              disabled={!cartEntries.length || checkoutBusy}
              style={[styles.checkoutPrimaryButton, (!cartEntries.length || checkoutBusy) && styles.checkoutPrimaryButtonDisabled]}>
              <Text style={styles.checkoutPrimaryText}>{checkoutBusy ? "Processing..." : "Checkout"}</Text>
            </Pressable>
          </View>
          {checkoutBusy ? (
            <View style={styles.checkoutBusyRow}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.checkoutBusyText}>Opening payment sheet...</Text>
            </View>
          ) : null}
          <Pressable onPress={() => setCheckoutOpen(false)} style={styles.checkoutCloseButton}>
            <Text style={styles.checkoutCloseText}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  ) : null;

  return (
    <Screen padded={false}>
      <View style={styles.topBar} onLayout={(e) => setTopBarHeight(Math.round(e.nativeEvent.layout.height))}>
        <Pressable onPress={() => navigation.navigate("Feed")} style={styles.feedBtn}>
          <Ionicons name="newspaper-outline" size={16} color="#3D3D3D" />
          <Text style={styles.feedBtnText}>Feed</Text>
        </Pressable>
        <View style={styles.reelsBtn}>
          <Ionicons name="film-outline" size={16} color="#FFFFFF" />
          <Text style={styles.reelsBtnText}>Reels</Text>
        </View>
      </View>

      {error ? (
        <Pressable onPress={loadReels} style={styles.errorBox} onLayout={(e) => setErrorHeight(Math.round(e.nativeEvent.layout.height))}>
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={styles.errorText}>{error}</Text>
        </Pressable>
      ) : null}

      <View style={styles.reelsArea} onLayout={(e) => setListHeight(Math.round(e.nativeEvent.layout.height))}>
        {loading && items.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            refreshing={loading}
            onRefresh={loadReels}
            keyExtractor={(item, idx) => String(item.id ?? idx)}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => {
              const uri = item.media_url || item.video_url;
              const isVideo = isVideoUrl(uri);
              const productTags = Array.isArray(item?.product_tags) ? item.product_tags : Array.isArray(item?.products) ? item.products : [];
              return (
                <View style={[styles.reelCard, { height: reelLayout.height, width: reelLayout.width }]}>
                  <View style={styles.reelFrame}>
                    {isVideo ? (
                      <Video source={{ uri }} style={styles.reelMedia} resizeMode="contain" shouldPlay isLooping isMuted />
                    ) : (
                      <Image source={{ uri }} style={styles.reelMedia} resizeMode="contain" />
                    )}
                    <View style={styles.metaOverlay}>
                      <Text style={styles.userText}>@{item.user || "creator"}</Text>
                      <Text style={styles.captionText} numberOfLines={2}>
                        {item.caption || "No caption"}
                      </Text>
                      {productTags.length ? (
                        <View style={styles.productTagRow}>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productTagScroll}>
                            {productTags.map((product) => {
                              const available = product?.is_active !== false && Number(product?.inventory_count || 0) > 0;
                              return (
                                <View key={`reel-tag-${product.id}`} style={[styles.productTagChip, !available && styles.productTagChipDisabled]}>
                                  <Text style={styles.productTagChipText} numberOfLines={1}>
                                    {product?.name || "Product"}
                                  </Text>
                                  <Text style={styles.productTagChipMeta}>
                                    {available
                                      ? `${formatProductPrice(product)} · ${Number(product?.inventory_count || 0)} left`
                                      : "Sold out"}
                                  </Text>
                                </View>
                              );
                            })}
                          </ScrollView>
                          <Pressable onPress={() => openCheckout(productTags)} style={styles.productTagButton}>
                            <Ionicons name="bag-outline" size={14} color="#FFFFFF" />
                            <Text style={styles.productTagButtonText}>Shop</Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.actionRail}>
                      <ActionIcon icon={item.liked_by_me ? "heart" : "heart-outline"} active={Boolean(item.liked_by_me)} onPress={() => toggleLike(item)} />
                      <ActionIcon icon="chatbubble-ellipses-outline" onPress={() => navigation.navigate("Comments", { post: item })} />
                      <ActionIcon icon="paper-plane-outline" onPress={() => shareReel(item)} />
                      <ActionIcon icon="repeat-outline" onPress={() => repostReel(item)} />
                      <ActionIcon icon="download-outline" onPress={() => downloadReel(item)} />
                    </View>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <BodyText>No reels yet.</BodyText>
              </View>
            }
          />
        )}
      </View>
      {checkoutModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  feedBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: "#D6D6D6",
    backgroundColor: "#F6F6F6",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  feedBtnText: {
    color: "#3D3D3D",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  reelsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: "#868686",
    paddingHorizontal: 14,
    paddingVertical: 9,
    shadowColor: "#5A5A5A",
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  reelsBtnText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  errorBox: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#D3D3D3",
    backgroundColor: "#F5F5F5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  errorText: {
    color: colors.danger,
    fontFamily: fonts.body,
    flex: 1,
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  reelsArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 10,
    paddingBottom: 22,
    gap: 12,
    alignItems: "center",
  },
  reelCard: {
    backgroundColor: "#FDFDFD",
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#DBDBDB",
    padding: 9,
    overflow: "hidden",
  },
  reelFrame: {
    flex: 1,
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "#D1D1D1",
    backgroundColor: "#F5F5F5",
    position: "relative",
  },
  reelMedia: {
    width: "100%",
    height: "100%",
    backgroundColor: "#202020",
  },
  userText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 13,
  },
  captionText: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 18,
  },
  actionRail: {
    position: "absolute",
    right: 10,
    bottom: 14,
    gap: 10,
    alignItems: "center",
  },
  metaOverlay: {
    position: "absolute",
    left: 10,
    right: 56,
    bottom: 14,
    gap: 4,
  },
  productTagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
  },
  productTagScroll: {
    gap: 6,
    paddingRight: 8,
  },
  productTagChip: {
    minWidth: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    backgroundColor: "rgba(18, 18, 18, 0.65)",
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  productTagChipDisabled: {
    opacity: 0.55,
  },
  productTagChipText: {
    color: "#F2F2F2",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  productTagChipMeta: {
    color: "rgba(255, 255, 255, 0.65)",
    fontFamily: fonts.body,
    fontSize: 9,
    marginTop: 2,
  },
  productTagButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  productTagButtonText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 10,
  },
  checkoutBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.65)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  checkoutCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    gap: 12,
  },
  checkoutTitle: {
    fontFamily: fonts.display,
    fontWeight: "800",
    fontSize: 18,
    color: colors.text,
  },
  checkoutList: {
    gap: 10,
    paddingBottom: 2,
  },
  checkoutItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E6E6E6",
    padding: 12,
    backgroundColor: "#FAFAFA",
  },
  checkoutItemInfo: {
    flex: 1,
  },
  checkoutItemTitle: {
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 13,
    color: colors.text,
  },
  checkoutItemMeta: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.subtext,
    marginTop: 2,
  },
  checkoutQtyControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  checkoutQtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D6D6D6",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutQtyButtonDisabled: {
    opacity: 0.5,
  },
  checkoutQtyText: {
    minWidth: 20,
    textAlign: "center",
    fontFamily: fonts.mono,
    fontWeight: "700",
    fontSize: 12,
    color: colors.text,
  },
  checkoutSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderTopWidth: 1,
    borderColor: "#E6E6E6",
    paddingTop: 10,
  },
  checkoutSummaryLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.subtext,
  },
  checkoutSummaryValue: {
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 13,
    color: colors.text,
    marginTop: 2,
  },
  checkoutPrimaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutPrimaryButtonDisabled: {
    backgroundColor: "#BDBDBD",
  },
  checkoutPrimaryText: {
    color: "#FFFFFF",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  checkoutBusyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkoutBusyText: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 12,
  },
  checkoutCloseButton: {
    alignSelf: "stretch",
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    alignItems: "center",
  },
  checkoutCloseText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  actionIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(33, 33, 33, 0.52)",
  },
  emptyState: {
    alignItems: "center",
    marginTop: 70,
  },
});

function ActionIcon({ icon, onPress, active = false }) {
  return (
    <Pressable onPress={onPress} style={styles.actionIconBtn}>
      <Ionicons name={icon} size={18} color={active ? "#808080" : "#FFFFFF"} />
    </Pressable>
  );
}





