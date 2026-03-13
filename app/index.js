import { Directory, File, Paths } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as MediaLibrary from "expo-media-library";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Modal,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { captureRef } from "react-native-view-shot";
import {
  configureWebRTC,
  mediaDevices,
  RTCView,
  useBlinkDetection,
  useFaceDetection,
} from "react-native-webrtc-face-detection";

const { width, height } = Dimensions.get("window");

configureWebRTC({
  enableFaceDetection: true,
});

export default function HomeScreen() {
  const [stream, setStream] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState("user");
  const [detectionEnabled, setDetectionEnabled] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const [faceDetected, setFaceDetected] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [lastPreviewImage, setLastPreviewImage] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // OFFSET METHOD
  const [blinkOffset, setBlinkOffset] = useState(0);
  const [displayCount, setDisplayCount] = useState(0);

  const videoTrack = stream?.getVideoTracks()[0] ?? null;
  const lastBlinkTime = useRef(0);
  const rtcViewRef = useRef(null);

  // Request media permissions
  useEffect(() => {
    (async () => {
      await MediaLibrary.requestPermissionsAsync();
    })();
  }, []);

  // Face detection hook
  const {
    detectionResult,
    isDetecting,
    error: faceError,
    enable: enableFaceDetection,
    disable: disableFaceDetection,
  } = useFaceDetection(videoTrack, {
    enabled: detectionEnabled,
    frameSkipCount: 2,
  });

  // Blink detection hook
  const {
    blinkCount,
    enable: enableBlinkDetection,
    disable: disableBlinkDetection,
  } = useBlinkDetection(videoTrack, {
    enabled: detectionEnabled,
    blinkThreshold: 0.3,
    captureOnBlink: false,
    onBlink: (event) => {
      const now = Date.now();
      if (now - lastBlinkTime.current < 300) return;
      lastBlinkTime.current = now;
      console.log("👁️ Blink detected!");
    },
  });

  // Calculate real blink count (2 events = 1 blink)
  useEffect(() => {
    const rawCount = Math.max(0, blinkCount - blinkOffset);
    const realBlinkCount = Math.floor(rawCount / 2);
    setDisplayCount(realBlinkCount);

    if (realBlinkCount >= 4 && !isProcessing) {
      console.log("🎯 4 blinks reached! Auto-capturing...");
      autoCapture();
    }
  }, [blinkCount, blinkOffset]);

  // Auto-enable detection
  useEffect(() => {
    if (videoTrack && isCameraActive) {
      setDetectionEnabled(true);
      setTimeout(() => {
        enableFaceDetection();
        enableBlinkDetection();
      }, 500);
    } else {
      setDetectionEnabled(false);
      disableFaceDetection();
      disableBlinkDetection();
    }
  }, [videoTrack, isCameraActive]);

  // Monitor face detection
  useEffect(() => {
    if (detectionResult) {
      const hasFaces =
        detectionResult.faces && detectionResult.faces.length > 0;
      if (faceDetected && !hasFaces) {
        resetBlinkState();
      }
      setFaceDetected(hasFaces);
    }
  }, [detectionResult]);

  // Auto capture function
  const autoCapture = async () => {
    if (!rtcViewRef.current || !isCameraActive || isProcessing) return;

    setIsProcessing(true);

    try {
      console.log("📸 Auto-capturing image...");

      const base64Image = await captureRef(rtcViewRef, {
        format: "png",
        quality: 0.9,
        result: "base64",
      });

      await processAndSaveImage(base64Image);
      setBlinkOffset(blinkCount);
    } catch (error) {
      console.log("❌ Auto-capture error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const processAndSaveImage = async (base64Image) => {
    try {
      console.log("💾 Processing image...");
      console.log("Base64 length:", base64Image.length);

      // 🔥 সম্পূর্ণ Base64 স্ট্রিং লগ করুন (ছোট ইমেজ হলে)
      console.log("=================================");
      console.log("FULL BASE64 STRING:");
      console.log(base64Image);
      console.log("=================================");

      // অথবা প্রথম 500 এবং শেষ 500 ক্যারেক্টার দেখান (বড় ইমেজ হলে)
      console.log("BASE64 START (first 500 chars):");
      console.log(base64Image.substring(0, 500));
      console.log("BASE64 END (last 500 chars):");
      console.log(base64Image.substring(base64Image.length - 500));

      // Base64 ফরম্যাট চেক করুন
      console.log(
        "Contains 'base64,' prefix:",
        base64Image.includes("base64,"),
      );
      console.log(
        "Starts with 'data:image':",
        base64Image.startsWith("data:image"),
      );

      // 1. Base64 ক্লিন করুন (শুধু ডিবাগের জন্য)
      // let base64String = base64Image;
      if (base64Image.includes("base64,")) {
        base64String = base64Image.split("base64,")[1];
        console.log("After split - length:", base64String.length);
        console.log("After split - first 100:", base64String.substring(0, 100));
      }
      console.log("💾 Processing image...");
      console.log("Base64 length:", base64Image.length);

      // 1. Base64 ক্লিন করুন
      let base64String = base64Image;
      if (base64Image.includes("base64,")) {
        base64String = base64Image.split("base64,")[1];
      }

      // 2. ক্যাশে ডিরেক্টরি তৈরি
      const tempDir = new Directory(Paths.cache, "temp_images");
      await tempDir.create({ idempotent: true });

      // 3. টেম্প ফাইল তৈরি (PNG)
      const tempFile = new File(tempDir, `temp_${Date.now()}.png`); // 🔥 .png
      await tempFile.create();

      // 4. Base64 ডাটা লেখা
      const bytes = Uint8Array.from(atob(base64String), (c) => c.charCodeAt(0));
      await tempFile.write(bytes);

      // 5. ইমেজ ম্যানিপুলেশন - PNG হিসেবে রাখুন
      const manipResult = await ImageManipulator.manipulateAsync(
        tempFile.uri,
        [{ resize: { width: 640 } }],
        { compress: 1, format: ImageManipulator.SaveFormat.PNG }, // 🔥 PNG
      );

      // 6. স্থায়ী ডিরেক্টরি তৈরি
      const faceDir = new Directory(Paths.document, "captured_faces");
      await faceDir.create({ idempotent: true });

      // 7. ফাইনাল ফাইল তৈরি (PNG)
      const finalFile = new File(faceDir, `face_${Date.now()}.png`); // 🔥 .png
      const manipFile = new File(manipResult.uri);
      await manipFile.copy(finalFile);

      // 8. টেম্প ফাইল ডিলিট
      await tempFile.delete();
      await manipFile.delete();

      // 9. ফাইল exist কিনা চেক করুন
      const fileInfo = await finalFile.info();
      console.log("📁 File exists:", fileInfo.exists);
      console.log("📁 File size:", fileInfo.size);

      if (fileInfo.exists) {
        const newImage = {
          id: Date.now(),
          uri: finalFile.uri,
          timestamp: new Date().toLocaleTimeString(),
          size: fileInfo.size,
        };

        setCapturedImages((prev) => [newImage, ...prev].slice(0, 20));
        setLastPreviewImage(newImage);

        console.log("✅ Image saved successfully!");
        Alert.alert("✅ Captured!", "Image saved successfully");
      }
    } catch (error) {
      console.log("❌ Save error:", error);
      Alert.alert("Error", "Failed to save image: " + error.message);
    }
  };

  const resetBlinkState = () => {
    setBlinkOffset(blinkCount);
  };

  const startWebRTCCamera = async () => {
    try {
      const constraints = {
        video: {
          facingMode: facingMode,
          frameRate: 30,
          width: 640,
          height: 480,
        },
        audio: false,
      };

      const mediaStream = await mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setIsCameraActive(true);

      setBlinkOffset(0);
      setDisplayCount(0);
      setFaceDetected(false);
      lastBlinkTime.current = 0;
    } catch (error) {
      Alert.alert("Camera Error", error.message);
    }
  };

  const stopWebRTCCamera = () => {
    setDetectionEnabled(false);
    disableFaceDetection();
    disableBlinkDetection();

    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream.release();
      setStream(null);
    }
    setIsCameraActive(false);
  };

  const switchCamera = () => {
    stopWebRTCCamera();
    const newMode = facingMode === "user" ? "environment" : "user";
    setFacingMode(newMode);
    setTimeout(startWebRTCCamera, 500);
  };

  const resetBlinks = () => {
    resetBlinkState();
  };

  const viewImage = (image) => {
    setSelectedImage(image);
    setModalVisible(true);
  };

  const deleteImage = (imageId) => {
    const image = capturedImages.find((img) => img.id === imageId);
    if (image?.uri) {
      new File(image.uri)
        .delete()
        .catch((err) => console.log("Error deleting file:", err));
    }

    setCapturedImages((prev) => prev.filter((img) => img.id !== imageId));
    if (lastPreviewImage?.id === imageId) {
      setLastPreviewImage(capturedImages.length > 1 ? capturedImages[1] : null);
    }
    setModalVisible(false);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#000" translucent />

      <View style={styles.cameraContainer}>
        {isCameraActive && stream ? (
          <RTCView
            ref={rtcViewRef}
            streamURL={stream.toURL()}
            style={styles.rtcView}
            objectFit="cover"
            mirror={facingMode === "user"}
          />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>Camera Off</Text>
          </View>
        )}

        <View style={styles.topOverlay}>
          <View style={styles.statsRow}>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>
                👤 {detectionResult?.faces?.length || 0}
              </Text>
            </View>
            <View style={styles.statBadge}>
              <Text style={styles.statBadgeText}>👁️ {displayCount}/4</Text>
            </View>
          </View>

          <View style={styles.cameraControls}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={switchCamera}
              disabled={!isCameraActive}
            >
              <Text style={styles.iconButtonText}>🔄</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.iconButton}
              onPress={resetBlinks}
              disabled={!isCameraActive}
            >
              <Text style={styles.iconButtonText}>↺</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isCameraActive && displayCount > 0 && displayCount < 4 && (
          <View style={styles.progressOverlay}>
            <View
              style={[
                styles.progressBar,
                { width: `${(displayCount / 4) * 100}%` },
              ]}
            />
          </View>
        )}

        {isProcessing && (
          <View style={styles.processingOverlay}>
            <Text style={styles.processingText}>📸 CAPTURING...</Text>
          </View>
        )}

        <View style={styles.bottomControls}>
          <TouchableOpacity
            style={styles.powerButton}
            onPress={isCameraActive ? stopWebRTCCamera : startWebRTCCamera}
          >
            <Text style={styles.powerButtonText}>
              {isCameraActive ? "⏹" : "▶"}
            </Text>
          </TouchableOpacity>
        </View>

        {lastPreviewImage && (
          <TouchableOpacity
            style={styles.previewBox}
            onPress={() => viewImage(lastPreviewImage)}
          >
            <Image
              source={{ uri: lastPreviewImage.uri + `?t=${Date.now()}` }}
              style={styles.previewImage}
              resizeMode="cover"
              onLoad={() => console.log("✅ Preview loaded")}
              onError={(error) =>
                console.log("❌ Preview error:", error.nativeEvent.error)
              }
            />
          </TouchableOpacity>
        )}
      </View>

      <Modal
        visible={modalVisible}
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            {selectedImage && (
              <>
                <Image
                  source={{ uri: selectedImage.uri }}
                  style={styles.modalImage}
                />
                <Text style={styles.modalTime}>{selectedImage.timestamp}</Text>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.closeModalButton}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.modalButtonText}>Close</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => deleteImage(selectedImage.id)}
                  >
                    <Text style={styles.modalButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
    position: "relative",
  },
  rtcView: {
    flex: 1,
    width: width,
    height: height,
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  placeholderText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  topOverlay: {
    position: "absolute",
    top: 50,
    left: 20,
    right: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statBadge: {
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#4CAF50",
  },
  statBadgeText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  cameraControls: {
    flexDirection: "row",
    gap: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#fff",
  },
  iconButtonText: {
    color: "#fff",
    fontSize: 20,
  },
  progressOverlay: {
    position: "absolute",
    bottom: 100,
    left: 50,
    right: 50,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: "#4CAF50",
    borderRadius: 2,
  },
  processingOverlay: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  processingText: {
    backgroundColor: "#4CAF50",
    color: "#fff",
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    fontWeight: "bold",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#fff",
  },
  bottomControls: {
    position: "absolute",
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  powerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  powerButtonText: {
    color: "#fff",
    fontSize: 24,
  },
  previewBox: {
    position: "absolute",
    bottom: 30,
    left: 20,
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4CAF50",
    backgroundColor: "#1a1a1a",
    overflow: "hidden",
  },
  previewImage: {
    width: "100%",
    height: "100%",
  },
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  modalContent: {
    backgroundColor: "#1a1a1a",
    padding: 20,
    borderRadius: 16,
    alignItems: "center",
    width: "90%",
  },
  modalImage: {
    width: 300,
    height: 300,
    borderRadius: 16,
    marginBottom: 15,
    borderWidth: 3,
    borderColor: "#4CAF50",
  },
  modalTime: {
    color: "#888",
    fontSize: 14,
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-around",
    width: "100%",
  },
  closeModalButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginRight: 10,
  },
  deleteButton: {
    backgroundColor: "#FF4444",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginLeft: 10,
  },
  modalButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
});
