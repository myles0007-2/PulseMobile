import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text, View, StyleSheet, Alert } from 'react-native';
import { Track } from '../types';
import { downloadManager, DownloadTask } from '../services/downloadManager';
import { useStore } from '../store/useStore';

interface DownloadButtonProps {
  track: Track;
  size?: 'small' | 'medium';
}

// Alert rate limiter: max 1 alert per 3 seconds
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 3000;
const alertQueue: Array<{ title: string; message: string }> = [];
let alertProcessing = false;

async function showRateLimitedAlert(title: string, message: string) {
  const now = Date.now();
  if (now - lastAlertTime >= ALERT_COOLDOWN_MS && !alertProcessing) {
    lastAlertTime = now;
    alertProcessing = true;
    Alert.alert(title, message);
    setTimeout(() => {
      alertProcessing = false;
      if (alertQueue.length > 0) {
        const next = alertQueue.shift();
        if (next) showRateLimitedAlert(next.title, next.message);
      }
    }, ALERT_COOLDOWN_MS);
  } else {
    alertQueue.push({ title, message });
  }
}

export const DownloadButton: React.FC<DownloadButtonProps> = ({ track, size = 'medium' }) => {
  const [task, setTask] = useState<DownloadTask | undefined>();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Check if already downloaded
    const checkDownload = async () => {
      const path = await downloadManager.getDownloadedFilePath(track.id);
      if (path) {
        setTask({ id: `${track.id}`, track, status: 'completed', progress: 100, bytesDownloaded: 0, totalBytes: 0, retryAttempts: 0 });
      }
    };

    checkDownload();

    // Listen to download progress
    downloadManager.onProgress((p) => {
      if (p.taskId.includes(track.id)) {
        setProgress(p.progress);
      }
    });

    // Listen to download completion
    downloadManager.onComplete((taskId, success) => {
      if (taskId.includes(track.id)) {
        if (success) {
          setTask({ id: taskId, track, status: 'completed', progress: 100, bytesDownloaded: 0, totalBytes: 0, retryAttempts: 0 });
          setProgress(100);
          showRateLimitedAlert('Download Complete', `"${track.title}" has been saved offline.`);
        } else {
          setTask(undefined);
          setProgress(0);
          showRateLimitedAlert('Download Failed', `Failed to download "${track.title}".`);
        }
      }
    });
  }, [track.id]);

  const handleDownload = async () => {
    if (task?.status === 'completed') return; // Already downloaded
    if (task?.status === 'downloading') {
      await downloadManager.pauseDownload();
      setTask(undefined);
      return;
    }

    // Start download
    const taskId = await downloadManager.queueDownload(track);
    setTask({ id: taskId, track, status: 'queued', progress: 0, bytesDownloaded: 0, totalBytes: 0, retryAttempts: 0 });
  };

  const styles = StyleSheet.create({
    container: {
      paddingHorizontal: 8,
      justifyContent: 'center',
      alignItems: 'center',
    },
    button: {
      padding: size === 'small' ? 6 : 8,
      borderRadius: 6,
      backgroundColor: '#333',
    },
    text: {
      fontSize: size === 'small' ? 12 : 14,
      color: '#fff',
      fontWeight: '600',
    },
    completed: {
      backgroundColor: '#4CAF50',
    },
  });

  if (!task || task.status === 'queued') {
    return (
      <TouchableOpacity style={[styles.button]} onPress={handleDownload}>
        <Text style={styles.text}>⬇ Download</Text>
      </TouchableOpacity>
    );
  }

  if (task.status === 'downloading') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={styles.button} onPress={handleDownload}>
          <Text style={styles.text}>{progress}%</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (task.status === 'completed') {
    return (
      <View style={styles.container}>
        <TouchableOpacity style={[styles.button, styles.completed]} disabled>
          <Text style={styles.text}>✓ Cached</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (task.status === 'failed') {
    return (
      <TouchableOpacity style={styles.button} onPress={handleDownload}>
        <Text style={styles.text}>⚠ Retry</Text>
      </TouchableOpacity>
    );
  }

  return null;
};
