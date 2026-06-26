#import <React/RCTBridgeModule.h>
#import <MediaPlayer/MediaPlayer.h>
#import <UIKit/UIKit.h>

@interface MusicLibraryModule : NSObject <RCTBridgeModule>
@end

@implementation MusicLibraryModule

RCT_EXPORT_MODULE();

// DISABLED: Native media library access causes startup crashes on iPhone X.
// Re-enable after fixing synchronous initialization.
// For now, all methods return empty/false to allow app to launch.

RCT_EXPORT_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // DISABLED: Causes startup crash on iPhone X
  resolve(@NO);
}

RCT_EXPORT_METHOD(getTracks:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // DISABLED: Causes startup crash on iPhone X
  resolve(@[]);
}

RCT_EXPORT_METHOD(getArtwork:(NSString *)trackId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
  // DISABLED: Causes startup crash on iPhone X
  resolve([NSNull null]);
}

@end
