import { useEffect, useMemo, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Video } from "expo-av";
import { ActivityIndicator, Alert, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useStripe } from "@stripe/stripe-react-native";
import API from "./services/api";
import { colors, fonts } from "./theme";
import { Card, Chip } from "./ui";

const VIDEO_PATTERN = /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i;
const MAX_REEL_SECONDS = 60;

function isVideoUrl(uri) {
  const value = String(uri || "").toLowerCase();
  if (!value) return false;
  return VIDEO_PATTERN.test(value) || value.includes("/video/upload/") || value.includes("/video/");
}

export default function ReelCard({
  item,
  onToggleLike,
  onOpenComments,
  onOpenProfile,
  onSharePost,
  onVotePoll,
  onCaptureMedia,
  onOpenViewer,
  captureBusy = false,
  showAiBadge = false,
  aiReason = "",
  fullBleed = false,
  mediaHeight = 320,
}) {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const author = item.user ?? item.brand ?? "LooksGood";
  const caption = item.caption ?? "No caption";
  const media = item.media_url ?? item.video_url ?? "";
  const likes = Number(item.likes_count ?? 0);
  const comments = Number(item.comments_count ?? 0);
  const shares = Number(item.shares_count ?? 0);
  const hasVideo = isVideoUrl(media);
  const showReason = Boolean(aiReason);
  const videoType = String(item.video_type || "original").toLowerCase();
  const reelLabel = hasVideo
    ? videoType === "remix"
      ? "Remix"
      : videoType === "duet"
      ? "Duet"
      : videoType === "collab"
      ? "Collab"
      : "Reel"
    : "Post";
  const typeNote =
    videoType === "remix" && item.remix_post_id
      ? `Remix of #${item.remix_post_id}`
      : videoType === "duet" && item.duet_post_id
      ? `Duet with #${item.duet_post_id}`
      : videoType === "collab" && item.collab_handle
      ? `Collab with ${item.collab_handle}`
      : "";

  const pollData = useMemo(() => {
    const rawPoll = item?.poll || {};
    const question = String(rawPoll.question ?? item?.poll_question ?? "").trim();
    let options = rawPoll.options ?? item?.poll_options ?? [];
    let votes = rawPoll.votes ?? item?.poll_votes ?? {};
    let totalVotes = rawPoll.total_votes ?? item?.poll_total_votes ?? 0;

    if (typeof options === "string") {
      try {
        options = JSON.parse(options);
      } catch (_err) {
        options = options.split(",").map((opt) => opt.trim());
      }
    }
    if (!Array.isArray(options)) {
      options = [];
    }
    options = options.map((opt) => String(opt || "").trim()).filter(Boolean).slice(0, 4);

    if (typeof votes === "string") {
      try {
        votes = JSON.parse(votes);
      } catch (_err) {
        votes = {};
      }
    }
    if (!votes || typeof votes !== "object") {
      votes = {};
    }

    const normalizedVotes = {};
    options.forEach((opt) => {
      normalizedVotes[opt] = Number(votes?.[opt] ?? 0) || 0;
    });
    const numericTotal = Number(totalVotes);
    totalVotes = Number.isFinite(numericTotal) ? numericTotal : Object.values(normalizedVotes).reduce((sum, value) => sum + value, 0);

    if (!question || options.length < 2) return null;
    return { question, options, votes: normalizedVotes, total_votes: totalVotes };
  }, [item]);

  const productTags = useMemo(() => {
    const raw = item?.product_tags ?? item?.products ?? item?.productTags;
    if (Array.isArray(raw)) return raw;
    if (raw && Array.isArray(raw.products)) return raw.products;
    return [];
  }, [item?.product_tags, item?.products, item?.productTags]);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [cartItems, setCartItems] = useState({});
  const [pollState, setPollState] = useState(pollData);
  const [pollChoice, setPollChoice] = useState("");
  const [pollBusy, setPollBusy] = useState(false);

  useEffect(() => {
    setPollState(pollData);
    setPollChoice("");
  }, [item?.id, pollData?.question, Array.isArray(pollData?.options) ? pollData.options.join("|") : ""]);

  useEffect(() => {
    setCartItems({});
  }, [item?.id]);

  const submitPollVote = async (option) => {
    if (!pollState || pollBusy) return;
    setPollBusy(true);
    try {
      let updatedPoll = null;
      if (onVotePoll) {
        updatedPoll = await onVotePoll(item, option);
      } else if (item?.id) {
        const res = await API.post(`/social/posts/${item.id}/poll/vote`, { option });
        updatedPoll = res?.data?.poll || null;
      }
      if (updatedPoll) {
        setPollState(updatedPoll);
      } else {
        const nextVotes = { ...pollState.votes, [option]: (pollState.votes?.[option] || 0) + 1 };
        setPollState({
          ...pollState,
          votes: nextVotes,
          total_votes: (pollState.total_votes || 0) + 1,
        });
      }
      setPollChoice(option);
    } catch (err) {
      Alert.alert("Poll failed", err?.message || "Unable to submit your vote.");
    } finally {
      setPollBusy(false);
    }
  };

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

  const resolvePriceCents = (product) => {
    const cents = Number(product?.price_cents);
    if (Number.isFinite(cents)) return cents;
    const raw = Number(product?.price);
    if (Number.isFinite(raw)) return Math.round(raw * 100);
    return 0;
  };

  const cartEntries = useMemo(() => {
    return productTags
      .map((product) => ({
        product,
        quantity: Number(cartItems[product.id] || 0),
      }))
      .filter((entry) => entry.quantity > 0);
  }, [productTags, cartItems]);

  const cartCount = useMemo(() => cartEntries.reduce((sum, entry) => sum + entry.quantity, 0), [cartEntries]);

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

  const captureFromCamera = async (kind) => {
    if (captureBusy) return;

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera access to capture.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: kind === "video" ? ["videos"] : ["images"],
      allowsEditing: kind !== "video",
      quality: 0.9,
      aspect: [4, 5],
      videoMaxDuration: MAX_REEL_SECONDS,
    });

    if (result.canceled || !result.assets?.[0]) return;
    onCaptureMedia?.(result.assets[0], kind);
  };

  const openCameraPicker = () => {
    if (captureBusy) return;
    Alert.alert("Capture", "Create with camera", [
      { text: "Photo", onPress: () => captureFromCamera("image") },
      { text: "Video", onPress: () => captureFromCamera("video") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const chipColor = fullBleed ? "#F9F9F9" : "#404040";
  const chipBg = fullBleed ? "rgba(0, 0, 0, 0.45)" : "#F3F3F3";
  const aiChipBg = fullBleed ? "rgba(81, 81, 81, 0.7)" : "#F0F0F0";

  const headerContent = (
    <View style={[styles.headerRow, fullBleed && styles.headerRowOverlay]}>
      <TouchableOpacity onPress={() => onOpenProfile?.(item)} style={styles.authorWrap}>
        <View style={[styles.authorAvatarDot, fullBleed && styles.authorAvatarDotOverlay]}>
          <Ionicons name="person-outline" size={13} color={fullBleed ? "#F9F9F9" : "#404040"} />
        </View>
        <Text style={[styles.authorText, fullBleed && styles.authorTextOverlay]}>@{author}</Text>
      </TouchableOpacity>
      <View style={styles.headerRight}>
        <Chip color={chipColor} bg={chipBg}>{reelLabel}</Chip>
        {showAiBadge ? <Chip color="#F3F3F3" bg={aiChipBg}>AI Smart</Chip> : null}
        {item.sponsored ? <Chip color={colors.warning} bg={fullBleed ? "rgba(0, 0, 0, 0.5)" : "#F3F3F3"}>Sponsored</Chip> : null}
      </View>
    </View>
  );

  const captionBlock = (
    <View style={fullBleed ? styles.captionBlockOverlay : null}>
      <Text style={[styles.captionText, fullBleed && styles.captionTextOverlay]} numberOfLines={2}>
        {caption}
      </Text>
      {typeNote ? <Text style={[styles.typeNoteText, fullBleed && styles.typeNoteTextOverlay]}>{typeNote}</Text> : null}
      {showReason ? <Text style={[styles.aiReasonText, fullBleed && styles.aiReasonTextOverlay]}>{aiReason}</Text> : null}
    </View>
  );

  const actionRow = !item.sponsored ? (
    <View style={[styles.actionRow, fullBleed && styles.actionRowOverlay]}>
      <ActionIcon
        icon={item.liked_by_me ? "heart" : "heart-outline"}
        active={item.liked_by_me}
        count={likes}
        onPress={() => onToggleLike?.(item)}
        overlay={fullBleed}
      />
      <ActionIcon icon="chatbubble-ellipses-outline" count={comments} onPress={() => onOpenComments?.(item)} overlay={fullBleed} />
      <ActionIcon icon="paper-plane-outline" count={shares} onPress={() => onSharePost?.(item)} overlay={fullBleed} />
      <ActionIcon
        icon={captureBusy ? "hourglass-outline" : "camera-outline"}
        onPress={openCameraPicker}
        disabled={captureBusy}
        overlay={fullBleed}
      />
    </View>
  ) : null;

  const pollBlock = pollState ? (
    <View style={[styles.pollCard, fullBleed && styles.pollCardOverlay]}>
      <Text style={[styles.pollQuestion, fullBleed && styles.pollQuestionOverlay]} numberOfLines={2}>
        {pollState.question}
      </Text>
      <View style={styles.pollOptions}>
        {pollState.options.map((option) => {
          const totalVotes = Number(pollState.total_votes || 0);
          const optionVotes = Number(pollState.votes?.[option] || 0);
          const showResults = Boolean(pollChoice) || totalVotes > 0;
          const percent = totalVotes > 0 ? Math.round((optionVotes / totalVotes) * 100) : 0;
          return (
            <Pressable
              key={option}
              onPress={() => submitPollVote(option)}
              disabled={pollBusy || Boolean(pollChoice)}
              style={[
                styles.pollOptionBtn,
                pollBusy && styles.pollOptionDisabled,
                pollChoice === option && styles.pollOptionSelected,
                fullBleed && styles.pollOptionBtnOverlay,
              ]}>
              {showResults ? <View style={[styles.pollOptionFill, { width: `${percent}%` }]} /> : null}
              <View style={styles.pollOptionContent}>
                <Text style={[styles.pollOptionText, fullBleed && styles.pollOptionTextOverlay]} numberOfLines={1}>
                  {option}
                </Text>
                {showResults ? (
                  <Text style={[styles.pollPercentText, fullBleed && styles.pollPercentTextOverlay]}>{percent}%</Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.pollFooter, fullBleed && styles.pollFooterOverlay]}>
        {pollState.total_votes || 0} votes
      </Text>
    </View>
  ) : null;

  const productTagsBlock = productTags.length ? (
    <View style={[styles.productTagWrap, fullBleed && styles.productTagWrapOverlay]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productTagRow}>
        {productTags.map((product) => {
          const available = product?.is_active !== false && Number(product?.inventory_count || 0) > 0;
          return (
            <View
              key={`product-tag-${product.id}`}
              style={[
                styles.productTagChip,
                fullBleed && styles.productTagChipOverlay,
                !available && styles.productTagChipDisabled,
              ]}>
              <Text style={[styles.productTagChipText, fullBleed && styles.productTagChipTextOverlay]} numberOfLines={1}>
                {product?.name || "Product"}
              </Text>
              <Text style={[styles.productTagChipMeta, fullBleed && styles.productTagChipMetaOverlay]}>
                {available
                  ? `${formatProductPrice(product)} · ${Number(product?.inventory_count || 0)} left`
                  : "Sold out"}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      <Pressable
        onPress={() => setCheckoutOpen(true)}
        style={[styles.productTagButton, fullBleed && styles.productTagButtonOverlay]}>
        <Ionicons name="bag-outline" size={14} color={fullBleed ? "#FFFFFF" : "#202020"} />
        <Text style={[styles.productTagButtonText, fullBleed && styles.productTagButtonTextOverlay]}>{cartCount ? `Shop (${cartCount})` : "Shop"}</Text>
      </Pressable>
    </View>
  ) : null;

  const checkoutModal = productTags.length ? (
    <Modal transparent animationType="fade" visible={checkoutOpen} onRequestClose={() => setCheckoutOpen(false)}>
      <View style={styles.checkoutBackdrop}>
        <View style={styles.checkoutCard}>
          <Text style={styles.checkoutTitle}>Shop this look</Text>
          <ScrollView contentContainerStyle={styles.checkoutList} showsVerticalScrollIndicator={false}>
            {productTags.map((product) => {
              const available = product?.is_active !== false && Number(product?.inventory_count || 0) > 0;
              const maxQty = Math.max(0, Number(product?.inventory_count || 0));
              const qty = Number(cartItems[product.id] || 0);
              const disableMinus = qty <= 0;
              const disablePlus = !available || qty >= maxQty;
              return (
                <View key={`checkout-${product.id}`} style={styles.checkoutItem}>
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

  const adLink = item.sponsored && item.link ? (
    <TouchableOpacity style={[styles.adLinkBtn, fullBleed && styles.adLinkBtnOverlay]} onPress={() => item.link && Linking.openURL(item.link)}>
      <Ionicons name="open-outline" size={18} color={fullBleed ? "#FFFFFF" : colors.primary} />
    </TouchableOpacity>
  ) : null;

  return (
    <Card style={[styles.card, fullBleed && styles.cardFull, fullBleed && { height: mediaHeight }]}>
      {!fullBleed ? headerContent : null}

      <View style={[styles.feedFrame, fullBleed && styles.feedFrameFull, fullBleed && { height: mediaHeight }]}>
        {media ? (
          <View style={styles.mediaTapArea}>
            {hasVideo ? (
              <Video source={{ uri: media }} style={[styles.mediaView, fullBleed && styles.mediaViewFull, { height: mediaHeight }]} resizeMode="cover" shouldPlay isMuted isLooping />
            ) : (
              <Image source={{ uri: media }} style={[styles.mediaView, fullBleed && styles.mediaViewFull, { height: mediaHeight }]} resizeMode="cover" />
            )}
            <Pressable onPress={() => onOpenViewer?.(item)} style={styles.mediaOverlayTap} />
          </View>
        ) : (
          <View style={[styles.placeholder, fullBleed && styles.placeholderFull, { height: mediaHeight }]}>
            <Ionicons name="image-outline" size={28} color="#666666" />
            <Text style={styles.placeholderText}>No media</Text>
          </View>
        )}

        {fullBleed ? (
          <View pointerEvents="box-none" style={styles.fullOverlay}>
            <View style={styles.fullOverlayTop}>{headerContent}</View>
            <View style={styles.fullOverlayBottom}>
              {captionBlock}
              {productTagsBlock}
              {pollBlock}
              {actionRow}
              {adLink}
            </View>
          </View>
        ) : null}
      </View>

      {!fullBleed ? captionBlock : null}
      {!fullBleed ? productTagsBlock : null}
      {!fullBleed ? pollBlock : null}
      {!fullBleed ? actionRow : null}
      {!fullBleed ? adLink : null}
      {checkoutModal}
    </Card>
  );
}

function ActionIcon({ icon, onPress, count = null, active = false, disabled = false, overlay = false }) {
  const iconColor = overlay ? "#FFFFFF" : active ? colors.pink : colors.primaryDark;
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.actionWrap, disabled && styles.actionWrapDisabled]}>
      <View style={[styles.actionBtn, active && styles.actionBtnActive, overlay && styles.actionBtnOverlay]}>
        <Ionicons name={icon} size={17} color={iconColor} />
      </View>
      {count !== null ? <Text style={[styles.actionCount, overlay && styles.actionCountOverlay]}>{count}</Text> : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#DDDDDD",
    backgroundColor: "#FDFDFD",
    padding: 10,
    gap: 8,
    borderRadius: 20,
  },
  cardFull: {
    marginBottom: 0,
    padding: 0,
    gap: 0,
    borderWidth: 0,
    borderRadius: 0,
    backgroundColor: "transparent",
    shadowOpacity: 0,
    elevation: 0,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  headerRowOverlay: {
    paddingHorizontal: 0,
  },
  authorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  authorAvatarDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAEAEA",
    borderWidth: 1,
    borderColor: "#D7D7D7",
  },
  authorAvatarDotOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  authorText: {
    fontWeight: "800",
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  authorTextOverlay: {
    color: "#F9F9F9",
  },
  feedFrame: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "#292929",
    borderWidth: 1,
    borderColor: "#CECECE",
    minHeight: 250,
  },
  feedFrameFull: {
    borderRadius: 0,
    borderWidth: 0,
  },
  mediaTapArea: {
    width: "100%",
    position: "relative",
  },
  mediaView: {
    width: "100%",
    height: 320,
    backgroundColor: "#1B1B1B",
  },
  mediaViewFull: {
    height: "100%",
  },
  mediaOverlayTap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  placeholder: {
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  placeholderFull: {
    backgroundColor: "#1B1B1B",
  },
  placeholderText: {
    color: "#E1E1E1",
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
  },
  captionText: {
    color: colors.text,
    fontFamily: fonts.body,
    paddingHorizontal: 4,
    fontSize: 13,
    lineHeight: 19,
  },
  captionTextOverlay: {
    color: "#FFFFFF",
    paddingHorizontal: 0,
  },
  typeNoteText: {
    color: "#5F5F5F",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  typeNoteTextOverlay: {
    color: "rgba(255, 255, 255, 0.82)",
    paddingHorizontal: 0,
  },
  aiReasonText: {
    color: "#515151",
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  aiReasonTextOverlay: {
    color: "rgba(255, 255, 255, 0.8)",
    paddingHorizontal: 0,
  },
  captionBlockOverlay: {
    gap: 4,
  },
  pollCard: {
    borderRadius: 12,
    backgroundColor: "#FAFAFA",
    borderWidth: 1,
    borderColor: "#E4E4E4",
    padding: 8,
    gap: 6,
  },
  pollCardOverlay: {
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  pollQuestion: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  pollQuestionOverlay: {
    color: "#FFFFFF",
  },
  pollOptions: {
    gap: 6,
  },
  pollOptionBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E2E2E2",
    backgroundColor: "#FFFFFF",
    paddingVertical: 6,
    paddingHorizontal: 8,
    overflow: "hidden",
  },
  pollOptionBtnOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  pollOptionSelected: {
    borderColor: "#808080",
    backgroundColor: "#F2F2F2",
  },
  pollOptionDisabled: {
    opacity: 0.8,
  },
  pollOptionFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(134, 134, 134, 0.18)",
  },
  pollOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  pollOptionText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  pollOptionTextOverlay: {
    color: "#FFFFFF",
  },
  pollPercentText: {
    color: "#5F5F5F",
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: "700",
  },
  pollPercentTextOverlay: {
    color: "#F4F4F4",
  },
  pollFooter: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 11,
    fontWeight: "700",
  },
  pollFooterOverlay: {
    color: "rgba(255, 255, 255, 0.75)",
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 2,
    gap: 14,
    paddingHorizontal: 4,
  },
  actionRowOverlay: {
    paddingHorizontal: 0,
    marginTop: 8,
  },
  actionWrap: {
    alignItems: "center",
    gap: 2,
  },
  actionWrapDisabled: {
    opacity: 0.6,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#D9D9D9",
    backgroundColor: "#F6F6F6",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnActive: {
    backgroundColor: "#E9E9E9",
    borderColor: "#C9C9C9",
  },
  actionBtnOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  actionCountOverlay: {
    color: "#FFFFFF",
  },
  fullOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fullOverlayTop: {
    paddingVertical: 6,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
    borderRadius: 12,
    paddingHorizontal: 10,
  },
  fullOverlayBottom: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    borderRadius: 14,
    gap: 6,
  },
  adLinkBtnOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  actionCount: {
    color: colors.subtext,
    fontFamily: fonts.mono,
    fontSize: 11,
  },
  adLinkBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#DADADA",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8F8F8",
    alignSelf: "flex-start",
  },
  productTagWrap: {
    gap: 8,
    paddingHorizontal: 4,
  },
  productTagWrapOverlay: {
    paddingHorizontal: 0,
  },
  productTagRow: {
    gap: 8,
  },
  productTagChip: {
    minWidth: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E4E4E4",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  productTagChipOverlay: {
    borderColor: "rgba(255, 255, 255, 0.25)",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  productTagChipDisabled: {
    opacity: 0.55,
  },
  productTagChipText: {
    color: colors.text,
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 12,
  },
  productTagChipTextOverlay: {
    color: "#FFFFFF",
  },
  productTagChipMeta: {
    color: colors.subtext,
    fontFamily: fonts.body,
    fontSize: 10,
    marginTop: 2,
  },
  productTagChipMetaOverlay: {
    color: "rgba(255, 255, 255, 0.7)",
  },
  productTagButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "#F2F2F2",
    borderWidth: 1,
    borderColor: "#E1E1E1",
  },
  productTagButtonOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderColor: "rgba(255, 255, 255, 0.35)",
  },
  productTagButtonText: {
    color: "#202020",
    fontFamily: fonts.body,
    fontWeight: "800",
    fontSize: 11,
  },
  productTagButtonTextOverlay: {
    color: "#FFFFFF",
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
  checkoutBuyButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  checkoutBuyButtonDisabled: {
    backgroundColor: "#BDBDBD",
  },
  checkoutBuyText: {
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
});





