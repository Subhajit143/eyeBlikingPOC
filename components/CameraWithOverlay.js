import { Camera } from "expo-camera";
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

function CameraWithOverlay({ onCapture, onClose, facing = 'front' }) {
  const [errorMsg, setErrorMsg] = useState(null);
  const [cameraOrientation, setCameraOrientation] = useState(facing);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);

  useEffect(() => {
    askCameraPermission();
  }, []);

  const askCameraPermission = async () => {
    try {
      if (!permission?.granted) {
        await requestPermission();
      }
    } catch (e) {
      setErrorMsg("Unable to Get Camera Permission");
    }
  };

  const takePicture = async () => {
    try {
      if (!cameraRef.current) return;
      
      const photo = await cameraRef.current.takePictureAsync({ 
        quality: 0.9,
        base64: true 
      });
      
      console.log("Photo captured", photo.uri);

      // Process image (resize and rotate if front camera)
      let processedImage = photo;
      
      // Resize image
      const resizedImage = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 600, height: 600 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      
      processedImage = resizedImage;

      // Save to gallery
      await MediaLibrary.saveToLibraryAsync(processedImage.uri);

      // Return base64 image
      if (onCapture) {
        onCapture(processedImage.base64 || photo.base64, processedImage.uri);
      }

    } catch (error) {
      console.error("Error taking picture:", error);
      setErrorMsg("Unable to take picture. Please retry.");
    }
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>Camera permission required</Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={cameraRef}
        style={styles.camera}
        type={cameraOrientation === 'front' ? Camera.Constants.Type.front : Camera.Constants.Type.back}
        ratio="4:3"
      />
      
      <Text style={styles.errorText}>{errorMsg}</Text>

      {/* Face Overlay Box */}
      <View style={styles.overlayContainer}>
        <View style={styles.faceGuideBox} />
      </View>

      {/* Close Button */}
      {onClose && (
        <TouchableOpacity style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      )}

      {/* Flip Camera Button */}
      <TouchableOpacity
        style={styles.flipButton}
        onPress={() => setCameraOrientation(
          cameraOrientation === 'front' ? 'back' : 'front'
        )}
      >
        <Text style={styles.flipButtonText}>🔄</Text>
      </TouchableOpacity>

      {/* Capture Button */}
      <View style={styles.captureButtonContainer}>
        <TouchableOpacity style={styles.captureButton} onPress={takePicture}>
          <View style={styles.captureButtonInner} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  errorText: {
    color: 'red',
    textAlign: 'center',
    position: 'absolute',
    top: 40,
    left: 0,
    right: 0,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
  },
  permissionButton: {
    backgroundColor: '#4CAF50',
    padding: 15,
    borderRadius: 10,
    alignSelf: 'center',
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceGuideBox: {
    width: 280,
    height: 280,
    borderWidth: 3,
    borderColor: '#4CAF50',
    borderRadius: 20,
    backgroundColor: 'transparent',
  },
  closeButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  flipButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  flipButtonText: {
    color: '#fff',
    fontSize: 20,
  },
  captureButtonContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
});

export default CameraWithOverlay;