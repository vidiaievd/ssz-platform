import {
  MaintenanceSource,
  MaintenanceStatus,
} from '../../container/domain/value-objects/maintenance-status.vo.js';
import {
  onSchoolClosed,
  onSchoolPurgedKept,
  onSchoolRestored,
} from './school-course-maintenance.js';

const { MAINTAINED, UNMAINTAINED, OBSOLETE } = MaintenanceStatus;
const { AUTHOR, SCHOOL } = MaintenanceSource;

describe('school course maintenance rules', () => {
  describe('onSchoolClosed', () => {
    it('makes a maintained course unmaintained, set by the school', () => {
      expect(onSchoolClosed({ status: MAINTAINED, source: null })).toEqual({
        status: UNMAINTAINED,
        source: SCHOOL,
      });
      expect(onSchoolClosed({ status: MAINTAINED, source: AUTHOR })).toEqual({
        status: UNMAINTAINED,
        source: SCHOOL,
      });
    });

    it("leaves the author's own status alone", () => {
      expect(onSchoolClosed({ status: UNMAINTAINED, source: AUTHOR })).toBeNull();
      expect(onSchoolClosed({ status: OBSOLETE, source: AUTHOR })).toBeNull();
    });

    it('writes nothing twice', () => {
      expect(onSchoolClosed({ status: UNMAINTAINED, source: SCHOOL })).toBeNull();
    });
  });

  describe('onSchoolRestored', () => {
    it('brings back only what the school set', () => {
      expect(onSchoolRestored({ status: UNMAINTAINED, source: SCHOOL })).toEqual({
        status: MAINTAINED,
        source: SCHOOL,
      });
    });

    it('keeps what the author chose, even the same value over the school', () => {
      expect(onSchoolRestored({ status: UNMAINTAINED, source: AUTHOR })).toBeNull();
      expect(onSchoolRestored({ status: OBSOLETE, source: AUTHOR })).toBeNull();
      expect(onSchoolRestored({ status: MAINTAINED, source: AUTHOR })).toBeNull();
      expect(onSchoolRestored({ status: MAINTAINED, source: null })).toBeNull();
    });
  });

  describe('onSchoolPurgedKept', () => {
    it('makes every kept course obsolete, whoever set it before', () => {
      expect(onSchoolPurgedKept({ status: MAINTAINED, source: null })).toEqual({
        status: OBSOLETE,
        source: SCHOOL,
      });
      expect(onSchoolPurgedKept({ status: UNMAINTAINED, source: AUTHOR })).toEqual({
        status: OBSOLETE,
        source: SCHOOL,
      });
    });

    it('does not rewrite an obsolete course', () => {
      expect(onSchoolPurgedKept({ status: OBSOLETE, source: AUTHOR })).toBeNull();
    });
  });
});
